// Contains the SQL helper methods for adding, mutating, and deleting to tables related to excel spreadsheets.
// This includes the mapping, product list, and substrate defect excel files.

import { getDb, MAX_PARAMS } from '@/db';
import { OemMapping, OemProductMapRow, ProductDefectMapRow, SubstrateDefectRow } from './types';

/**
 * Fetch all rows from the `oem_product_map` table.
 *
 * @returns An array of all OEM → internal product mappings.
 */
export async function getAllOemProductMappings(): Promise<OemProductMapRow[]> {
    const db = await getDb();
    const rows = await db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM oem_product_map`
    );
    return rows;
}

/**
 * Fetch a single `oem_product_map` row by its primary key `oem_product_id`.
 *
 * @param oem_product_id - The OEM product ID to search for.
 * @returns The row if found, otherwise null.
 */
export async function getOemProductMappingByOemId(
    oem_product_id: string
): Promise<OemProductMapRow | null> {
    const db = await getDb();
    const rows = await db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM oem_product_map
    WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return rows[0] ?? null;
}

/**
 * Fetch a single `oem_product_map` row by its unique `product_id`.
 *
 * @param product_id - The internal product ID to search for.
 * @returns The row if found, otherwise null.
 */
export async function getOemProductMappingByProductId(
    product_id: string
): Promise<OemProductMapRow | null> {
    const db = await getDb();
    const rows = await db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM oem_product_map
    WHERE product_id = ?`,
        [product_id]
    );
    return rows[0] ?? null;
}

/**
 * Delete a mapping by its `oem_product_id`.
 *
 * @param oem_product_id - The OEM product ID to delete.
 * @returns `true` if completed without error.
 */
export async function deleteOemProductMappingByOemId(
    oem_product_id: string
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM oem_product_map
    WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return true;
}

/**
 * Delete a mapping by its `product_id`.
 *
 * @param product_id - The internal product ID to delete.
 * @returns `true` if completed without error.
 */
export async function deleteOemProductMappingByProductId(
    product_id: string
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM oem_product_map
    WHERE product_id = ?`,
        [product_id]
    );
    return true;
}

/**
 * Ensures that a specific (oem_product_id, product_id) mapping exists
 * in the `oem_product_map` table.
 *
 * The function:
 * 1. Checks if the given pair already exists in the database.
 * 2. If it exists, returns `true`.
 * 3. If it does not exist, attempts to insert the mapping.
 * 4. Relies on SQL constraints to enforce uniqueness and validity.
 *
 * @param oemProductId - The OEM product ID to verify or insert.
 * @param productId - The internal product ID to verify or insert.
 * @returns `true` if the mapping already exists or is successfully inserted.
 * @throws If a database error occurs during verification or insertion.
 */
export async function ensureOemMapping(
    oemProductId: string,
    productId: string
): Promise<boolean> {
    try {
        const db = await getDb();
        const existing = await db.select<{ count: number }[]>(
            `SELECT COUNT(*) as count
    FROM oem_product_map
    WHERE oem_product_id = ? AND product_id = ?`,
            [oemProductId, productId]
        );

        if (existing[0]?.count > 0) {
            // Mapping already exists
            return true;
        }

        // Try to insert the mapping (will fail if product_id already mapped to another OEM ID)
        await db.execute(
            `INSERT INTO oem_product_map (oem_product_id, product_id)
    VALUES (?, ?)`,
            [oemProductId, productId]
        );

        // db.execute doesn't return affected rows, so if no error, assume success
        return true;
    } catch (err) {
        console.error('Failed to insert or verify OEM mapping');
        throw err;
    }
}

/**
 * Inserts or updates a batch of (oem_product_id, product_id) mappings in the
 * `oem_product_map` table, and identifies mappings in the database that are
 * no longer present in the provided data.
 *
 * The function:
 * 1. Deduplicates the input array by `oem_product_id` (last occurrence wins).
 * 2. Performs batched UPSERT operations (`INSERT ... ON CONFLICT DO UPDATE`)
 *    to insert new mappings or update existing ones.
 * 3. After committing, queries the table to find OEM IDs that exist in the
 *    database but are not present in the input list, returning them as `missing`.
 * 4. Returns the total number of upserted records and the list of missing mappings.
 *
 * Relies on SQL constraints to enforce uniqueness and foreign key integrity.
 *
 * @param data - Array of OEM mappings to insert or update.
 * @returns An object containing:
 *   - `totUpserted`: The total number of inserted or updated mappings.
 *   - `missing`: An array of mappings present in the database but missing from the input.
 * @throws If any database error occurs during upsert or query.
 */
export async function maintainOemMapping(
    data: OemMapping[]
): Promise<{ tot: number, missing: OemMapping[] }> {
    const name = 'Maintain OEM Mapping';
    const db = await getDb();

    // Dedupe by OEM (last wins); optional but avoids redundant params
    const byOem = new Map<string, string>();
    for (const p of data)
        if (p?.oem_product_id && p?.product_id) byOem.set(p.oem_product_id, p.product_id);

    const pairs = Array.from(byOem.entries()).map(
        ([oem_product_id, product_id]) => ({ oem_product_id, product_id })
    );

    if (pairs.length === 0) return { tot: 0, missing: [] };

    const PARAMS_PER_ROW = 2;
    const UPSERT_ROWS_PER_CHUNK = Math.max(1, Math.floor(MAX_PARAMS / PARAMS_PER_ROW)); // 499

    // Helper: chunk an array
    const chunk = <T,>(arr: T[], size: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size)
            out.push(arr.slice(i, i + size));
        return out;
    };

    try {
        let tot: number = 0;
        await db.execute('BEGIN');

        for (const c of chunk(pairs, UPSERT_ROWS_PER_CHUNK)) {
            const placeholders = c.map(() => '(?, ?)').join(', ');
            const sql = `
INSERT INTO oem_product_map (oem_product_id, product_id)
    VALUES ${placeholders}
    ON CONFLICT(oem_product_id) DO UPDATE SET product_id = excluded.product_id`;
            const bindings: string[] = [];
            for (const r of c) bindings.push(r.oem_product_id, r.product_id);
            await db.execute(sql, bindings);
            tot += c.length;
        }

        await db.execute('COMMIT;');

        const current = await db.select<OemMapping[]>('SELECT oem_product_id, product_id FROM oem_product_map');

        const incomingOems = new Set(pairs.map(p => p.oem_product_id));
        const missing = current.filter(
            row => !incomingOems.has(row.oem_product_id)    // keep full rows for return
        );

        return { tot, missing };
    } catch (e: any) {
        const msg = `[${name}] ${typeof e === 'object' ? e.msg : e}`;
        console.error(msg);
        await db.execute('ROLLBACK;');
        throw Error(msg);
    }
}

// =============================================================================

/**
 * Fetch all rows from the `product_defect_map` table.
 *
 * @returns An array of all product_defect_map rows in the database.
 */
export async function getAllProductDefectMaps(): Promise<ProductDefectMapRow[]> {
    const db = await getDb();
    const rows = await db.select<ProductDefectMapRow[]>(
        `SELECT product_id, lot_id, wafer_id, sub_id, file_path
    FROM product_defect_map`
    );
    return rows;
}

/**
 * Fetch a single product_defect_map row by its composite primary key.
 *
 * @param product_id - Internal product id
 * @param lot_id - Lot/Batch id
 * @param wafer_id - Wafer id
 * @returns The row if found, otherwise null
 */
export async function getProductDefectMap(
    product_id: string,
    lot_id: string,
    wafer_id: string
): Promise<ProductDefectMapRow | null> {
    const db = await getDb();
    const rows = await db.select<ProductDefectMapRow[]>(
        `SELECT product_id, lot_id, wafer_id, sub_id, file_path
    FROM product_defect_map
    WHERE product_id = ? AND lot_id = ? AND wafer_id = ?`,
        [product_id, lot_id, wafer_id]
    );
    return rows[0] ?? null;
}

/**
 * Insert or update a single product_defect_map row (UPSERT by PK).
 * Relies on SQL constraints (FKs, etc.) for validity.
 *
 * @param row - Complete row to upsert
 * @returns true if no error was thrown
 * @throws if the DB rejects the write (e.g., FK violation)
 */
export async function upsertProductDefectMap(
    row: ProductDefectMapRow
): Promise<boolean> {
    const db = await getDb();
    // Upsert by composite PK (product_id, lot_id, wafer_id)
    await db.execute(
        `INSERT INTO product_defect_map
    (product_id, lot_id, wafer_id, sub_id, file_path)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, lot_id, wafer_id) DO UPDATE SET
        sub_id = excluded.sub_id,
        file_path = excluded.file_path`,
        [row.product_id, row.lot_id, row.wafer_id, row.sub_id, row.file_path]
    );
    return true;
}

/**
 * Batch UPSERT for product_defect_map.
 * - Deduplicates by composite PK (product_id, lot_id, wafer_id), last-wins.
 * - Chunks to respect SQLite param limits.
 * - Uses UPSERT on PK; updates sub_id and file_path.
 *
 * NOTE: If you also have a UNIQUE constraint on `sub_id`, and the same `sub_id`
 * maps to multiple wafers in incoming data or DB, you may still see a UNIQUE
 * error on `sub_id`. In that case, resolve by sub_id beforehand (last-wins) or
 * run a prior reconciliation step.
 */
export async function upsertManyProductDefectMaps(
    rows: ProductDefectMapRow[]
): Promise<number> {
    const name = 'Upsert Many Product Defect Maps';
    if (!rows.length) return 0;

    const db = await getDb();

    // 1) Dedupe by PK (last occurrence wins) + log duplicates
    const byPk = new Map<string, ProductDefectMapRow>();
    const duplicates: ProductDefectMapRow[] = [];

    for (const r of rows) {
        if (!r.product_id || !r.lot_id || !r.wafer_id) continue;

        const key = `${r.product_id}|${r.lot_id}|${r.wafer_id}`;
        if (byPk.has(key)) {
            duplicates.push(r); // record the later duplicate
        }
        byPk.set(key, r); // last occurrence wins
    }

    if (duplicates.length) {
        console.warn(
            `%c[upsertManyProductDefectMaps] Duplicate PK rows detected:`,
            "color: orange;",
            duplicates
        );
    }

    const unique = Array.from(byPk.values());
    if (unique.length === 0) return 0;

    // 2) Chunking
    const PARAMS_PER_ROW = 5; // product_id, lot_id, wafer_id, sub_id, file_path
    const ROWS_PER_CHUNK = Math.max(1, Math.floor((MAX_PARAMS ?? 999) / PARAMS_PER_ROW));

    const chunk = <T,>(arr: T[], size: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size)
            out.push(arr.slice(i, i + size));
        return out;
    };

    await db.execute('BEGIN;');
    try {
        for (const c of chunk(unique, ROWS_PER_CHUNK)) {
            const placeholders = c.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const sql =
                `INSERT INTO product_defect_map
    (product_id, lot_id, wafer_id, sub_id, file_path)
VALUES ${placeholders}
    ON CONFLICT(product_id, lot_id, wafer_id) DO UPDATE SET
    sub_id    = excluded.sub_id,
    file_path = excluded.file_path`;

            const bindings: string[] = [];
            for (const r of c)
                bindings.push(r.product_id, r.lot_id, r.wafer_id, r.sub_id, r.file_path);
            await db.execute(sql, bindings);
        }

        await db.execute('COMMIT;');
        return unique.length;
    } catch (e: any) {
        const msg = `[${name}] ${typeof e === 'object' ? e.msg : e}`;
        console.error(msg);
        await db.execute('ROLLBACK;');
        throw Error(msg);
    }
}

// NOTE: Typically, we do not have to manually delete the detect map because,
// if the file_index gets removed then this record also gets cleared.

/**
 * Delete a single product_defect_map row by its composite primary key.
 * Note: If the referenced file is deleted from file_index, this row is
 * removed automatically due to ON DELETE CASCADE on file_path.
 *
 * @param product_id - Internal product id
 * @param lot_id - Lot/Batch id
 * @param wafer_id - Wafer id
 * @returns true if completed without error (rows-affected not returned by plugin)
 * @throws if the DB rejects the write
 */
export async function deleteProductDefectMap(
    product_id: string,
    lot_id: string,
    wafer_id: string
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM product_defect_map
    WHERE product_id = ? AND lot_id = ? AND wafer_id = ?`,
        [product_id, lot_id, wafer_id]
    );
    return true;
}

/**
 * Convenience: delete rows by file_path (rarely needed since file_index CASCADE
 * already removes dependents). Useful if you want to remove mappings for a file
 * without touching file_index.
 *
 * @param file_path - Relative file path
 * @returns number of rows attempted (best-effort; plugin doesn't return changes)
 */
export async function deleteProductDefectMapByFilePath(
    file_path: string
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM product_defect_map
    WHERE file_path = ?`,
        [file_path]
    );
    return true;
}

// =============================================================================

/**
 * Fetch all rows from the `substrate_defect` table.
 *
 * @returns An array of all substrate_defect rows in the database.
 */
export async function getAllSubstrateDefects(): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    const rows = await db.select<SubstrateDefectRow[]>(
        `SELECT sub_id, file_path
    FROM substrate_defect`
    );
    return rows;
}

/**
 * Fetch a single `substrate_defect` row by its primary key `sub_id`.
 *
 * @param sub_id - The unique substrate defect identifier.
 * @returns The row if found, otherwise null.
 */
export async function getSubstrateDefectBySubId(sub_id: string): Promise<SubstrateDefectRow | null> {
    const db = await getDb();
    const rows = await db.select<SubstrateDefectRow[]>(
        `SELECT sub_id, file_path
    FROM substrate_defect
    WHERE sub_id = ?`,
        [sub_id]
    );
    return rows[0] ?? null;
}

/**
 * Fetch all `substrate_defect` rows that reference a given `file_path`.
 * Note: `file_path` may be shared by multiple sub_ids.
 *
 * @param file_path - Relative file path to search by.
 * @returns An array of matching rows (empty if none).
 */
export async function getSubstrateDefectsByFilePath(file_path: string): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    const rows = await db.select<SubstrateDefectRow[]>(
        `SELECT sub_id, file_path
    FROM substrate_defect
    WHERE file_path = ?`,
        [file_path]
    );
    return rows;
}

/**
 * Insert or update a `substrate_defect` row.
 * - Performs UPSERT by `sub_id` (PRIMARY KEY).
 * - Updates `file_path` when the `sub_id` already exists.
 *
 * @param row - The row to insert or update.
 * @returns `true` if completed without error.
 * @throws If the DB rejects the write (e.g., FK violation).
 */
export async function upsertSubstrateDefect(row: SubstrateDefectRow): Promise<boolean> {
    const name = 'Upsert Substrate Defect';
    const db = await getDb();

    try {
        await db.execute(
            `INSERT INTO substrate_defect (sub_id, file_path)
    VALUES (?, ?)
ON CONFLICT(sub_id) DO UPDATE SET
    file_path = excluded.file_path`,
            [row.sub_id, row.file_path]
        );
        return true;
    } catch (e: any) {
        const msg = `[${name}] ${typeof e === 'object' ? e.msg : e}`;
        console.error(msg);
        await db.execute('ROLLBACK;');
        throw Error(msg);
    }

}

/**
 * Batch upsert for `substrate_defect`.
 * - Deduplicates by PRIMARY KEY `sub_id` (last occurrence wins).
 * - Chunks to respect SQLite parameter limits.
 * - UPSERT updates `file_path` when `sub_id` exists.
 *
 * @param rows - Rows to insert or update
 * @returns Number of rows written (after dedupe)
 * @throws If the DB rejects the transaction
 */
export async function upsertManySubstrateDefects(
    rows: SubstrateDefectRow[]
): Promise<number> {
    if (!rows?.length) return 0;

    // 1) Dedupe by sub_id (last-wins)
    const byId = new Map<string, SubstrateDefectRow>();
    for (const r of rows) {
        if (!r?.sub_id) continue; // skip invalid
        byId.set(r.sub_id, r);
    }
    const unique = Array.from(byId.values());
    if (!unique.length) return 0;

    // 2) Chunking
    const PARAMS_PER_ROW = 2; // (sub_id, file_path)
    const limit = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(limit / PARAMS_PER_ROW));

    const chunk = <T,>(arr: T[], size: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    };

    const db = await getDb();
    await db.execute('BEGIN;');
    try {
        for (const c of chunk(unique, ROWS_PER_CHUNK)) {
            const placeholders = c.map(() => '(?, ?)').join(', ');
            const sql =
                `INSERT INTO substrate_defect (sub_id, file_path)
    VALUES ${placeholders}
ON CONFLICT(sub_id) DO UPDATE SET
    file_path = excluded.file_path`;

            const bindings: string[] = [];
            for (const r of c) bindings.push(r.sub_id, r.file_path);

            await db.execute(sql, bindings);
        }

        await db.execute('COMMIT;');
        return unique.length;
    } catch (e) {
        await db.execute('ROLLBACK;');
        throw e;
    }
}

/**
 * Delete a single `substrate_defect` row by `sub_id`.
 *
 * @param sub_id - The unique substrate defect identifier.
 * @returns `true` if completed without error.
 */
export async function deleteSubstrateDefectBySubId(sub_id: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM substrate_defect
    WHERE sub_id = ?`,
        [sub_id]
    );
    return true;
}

/**
 * Delete all `substrate_defect` rows that reference the given `file_path`.
 * (Useful when removing a specific file's defects without touching file_index.)
 *
 * @param file_path - Relative file path to delete by.
 * @returns `true` if completed without error.
 */
export async function deleteSubstrateDefectsByFilePath(file_path: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM substrate_defect
    WHERE file_path = ?`,
        [file_path]
    );
    return true;
}