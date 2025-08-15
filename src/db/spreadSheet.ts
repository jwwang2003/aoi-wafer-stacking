import { getDb, MAX_PARAMS } from '@/db';
import { OemMapping, OemProductMapRow, ProductDefectMapRow, SubstrateDefectRow } from './types';

// =============================================================================
// NOTE: OEM ↔ Internal product mapping helpers
// =============================================================================

export async function getAllOemProductMappings(): Promise<OemProductMapRow[]> {
    const db = await getDb();
    return db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM oem_product_map`
    );
}

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

export async function ensureOemMapping(
    oemProductId: string,
    productId: string
): Promise<boolean> {
    const db = await getDb();
    const existing = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) AS count
    FROM oem_product_map
    WHERE oem_product_id = ? AND product_id = ?`,
        [oemProductId, productId]
    );
    if (existing[0]?.count > 0) return true;

    await db.execute(
        `INSERT INTO oem_product_map (oem_product_id, product_id)
    VALUES (?, ?)`,
        [oemProductId, productId]
    );
    return true;
}

export async function maintainOemMapping(
    data: OemMapping[]
): Promise<{ tot: number; missing: OemMapping[] }> {
    const db = await getDb();

    // Dedupe by OEM id (last-wins)
    const byOem = new Map<string, string>();
    for (const p of data) if (p?.oem_product_id && p?.product_id) byOem.set(p.oem_product_id, p.product_id);

    const pairs = Array.from(byOem.entries()).map(([oem_product_id, product_id]) => ({ oem_product_id, product_id }));
    if (pairs.length === 0) return { tot: 0, missing: [] };

    const PARAMS_PER_ROW = 2;
    const UPSERT_ROWS_PER_CHUNK = Math.max(1, Math.floor(MAX_PARAMS / PARAMS_PER_ROW));
    const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    let tot = 0;
    await db.execute('BEGIN;');
    try {
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
        const missing = current.filter(row => !incomingOems.has(row.oem_product_id));
        return { tot, missing };
    } catch (e: any) {
        await db.execute('ROLLBACK;');
        throw e;
    }
}

// =============================================================================
// NOTE: product_defect_map helpers
// =============================================================================

/**
 * Get all rows in product_defect_map.
 */
export async function getAllProductDefectMaps(): Promise<ProductDefectMapRow[]> {
    const db = await getDb();
    return db.select<ProductDefectMapRow[]>(
        `SELECT oem_product_id, lot_id, wafer_id, sub_id, file_path
    FROM product_defect_map`
    );
}

/**
 * Get one row by composite PK (oem_product_id, lot_id, wafer_id).
 */
export async function getProductDefectMap(
    oem_product_id: string,
    lot_id: string,
    wafer_id: string
): Promise<ProductDefectMapRow | null> {
    const db = await getDb();
    const rows = await db.select<ProductDefectMapRow[]>(
        `SELECT oem_product_id, lot_id, wafer_id, sub_id, file_path
    FROM product_defect_map
    WHERE oem_product_id = ? AND lot_id = ? AND wafer_id = ?`,
        [oem_product_id, lot_id, wafer_id]
    );
    return rows[0] ?? null;
}

export async function getProductDefectMapsByOemId(
    oem_product_id: string,
    opts?: { limit?: number; offset?: number; orderBy?: 'lot_id' | 'wafer_id' | 'sub_id' }
): Promise<ProductDefectMapRow[]> {
    const db = await getDb();
    const limit = Number.isFinite(opts?.limit) ? opts!.limit! : undefined;
    const offset = Number.isFinite(opts?.offset) ? opts!.offset! : 0;

    const orderBy =
        opts?.orderBy === 'wafer_id'
            ? 'wafer_id ASC, lot_id ASC'
            : opts?.orderBy === 'sub_id'
                ? 'sub_id ASC, lot_id ASC, wafer_id ASC'
                : 'lot_id ASC, wafer_id ASC';

    const bindings: (string | number)[] = [oem_product_id];

    let sql = `
    SELECT oem_product_id, lot_id, wafer_id, sub_id, file_path
    FROM product_defect_map
    WHERE oem_product_id = ?
    ORDER BY ${orderBy}`;

    if (typeof limit === 'number') {
        sql += ` LIMIT ? OFFSET ?`;
        bindings.push(limit, offset);
    }

    return db.select<ProductDefectMapRow[]>(sql, bindings);
}

export async function getBatchesByOemId(
    oem_product_id: string
): Promise<{ lot_id: string }[]> {
    const db = await getDb();
    return db.select<{ lot_id: string }[]>(
        `SELECT DISTINCT lot_id
    FROM product_defect_map
    WHERE oem_product_id = ?
    ORDER BY lot_id ASC`,
        [oem_product_id]
    );
}

/**
 * Distinct wafers for (oem_product_id, lot_id). Sorted numerically.
 */
export async function getWafersByProductAndBatch(
    oem_product_id: string,
    lot_id: string
): Promise<{ wafer_id: string }[]> {
    const db = await getDb();
    return db.select<{ wafer_id: string }[]>(
        `SELECT DISTINCT wafer_id
    FROM product_defect_map
    WHERE oem_product_id = ? AND lot_id = ?
    ORDER BY CAST(wafer_id AS INTEGER) ASC`,
        [oem_product_id, lot_id]
    );
}

/**
 * Sub IDs for a (oem_product_id, lot_id, wafer_id) triple.
 */
export async function getSubIdsByProductBatchWafer(
    oem_product_id: string,
    batch_id: string, // equals lot_id
    wafer_id: string
): Promise<{ sub_id: string; file_path: string }[]> {
    const db = await getDb();
    return db.select<{ sub_id: string; file_path: string }[]>(
        `SELECT sub_id, file_path
    FROM product_defect_map
    WHERE oem_product_id = ?
        AND lot_id = ?
        AND wafer_id = ?
    ORDER BY sub_id ASC`,
        [oem_product_id, batch_id, wafer_id]
    );
}

/**
 * Upsert one row (PK: oem_product_id, lot_id, wafer_id).
 */
export async function upsertProductDefectMap(
    row: ProductDefectMapRow
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO product_defect_map
        roduct_id, lot_id, wafer_id, sub_id, file_path)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(oem_product_id, lot_id, wafer_id) DO UPDATE SET
        sub_id = excluded.sub_id,
        file_path = excluded.file_path`,
        [row.oem_product_id, row.lot_id, row.wafer_id, row.sub_id, row.file_path]
    );
    return true;
}

/**
 * Batch upsert (last-wins on PK).
 */
export async function upsertManyProductDefectMaps(
    rows: ProductDefectMapRow[]
): Promise<number> {
    if (!rows.length) return 0;

    const db = await getDb();

    // Dedupe by (oem_product_id|lot_id|wafer_id) + log duplicates
    const byPk = new Map<string, ProductDefectMapRow>();
    const duplicates: ProductDefectMapRow[] = [];
    for (const r of rows) {
        if (!r.oem_product_id || !r.lot_id || !r.wafer_id) continue;
        const key = `${r.oem_product_id}|${r.lot_id}|${r.wafer_id}`;
        if (byPk.has(key)) duplicates.push(r);
        byPk.set(key, r);
    }
    if (duplicates.length) {
        console.warn(
            '%c[upsertManyProductDefectMaps] Duplicate PK rows detected:',
            'color: orange;',
            duplicates
        );
    }

    const unique = Array.from(byPk.values());
    if (!unique.length) return 0;

    const PARAMS_PER_ROW = 5;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor((MAX_PARAMS ?? 999) / PARAMS_PER_ROW));
    const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    await db.execute('BEGIN;');
    try {
        for (const c of chunk(unique, ROWS_PER_CHUNK)) {
            const placeholders = c.map(() => '(?, ?, ?, ?, ?)').join(', ');
            const sql = `
        INSERT INTO product_defect_map
        (oem_product_id, lot_id, wafer_id, sub_id, file_path)
        VALUES ${placeholders}
        ON CONFLICT(oem_product_id, lot_id, wafer_id) DO UPDATE SET
        sub_id    = excluded.sub_id,
        file_path = excluded.file_path`;
            const bindings: string[] = [];
            for (const r of c) bindings.push(r.oem_product_id, r.lot_id, r.wafer_id, r.sub_id, r.file_path);
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
 * Delete by composite PK.
 */
export async function deleteProductDefectMap(
    oem_product_id: string,
    lot_id: string,
    wafer_id: string
): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM product_defect_map
    WHERE oem_product_id = ? AND lot_id = ? AND wafer_id = ?`,
        [oem_product_id, lot_id, wafer_id]
    );
    return true;
}

/**
 * Delete by file_path (manual clean; CASCADE from file_index will also clear).
 */
export async function deleteProductDefectMapByFilePath(file_path: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM product_defect_map
    WHERE file_path = ?`,
        [file_path]
    );
    return true;
}

// =============================================================================
// NOTE: substrate_defect helpers
// =============================================================================

export async function getAllSubstrateDefects(): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    return db.select<SubstrateDefectRow[]>(
        `SELECT sub_id, file_path
    FROM substrate_defect`
    );
}

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

export async function getSubstrateDefectsByFilePath(file_path: string): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    return db.select<SubstrateDefectRow[]>(
        `SELECT sub_id, file_path
    FROM substrate_defect
    WHERE file_path = ?`,
        [file_path]
    );
}

export async function upsertSubstrateDefect(row: SubstrateDefectRow): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO substrate_defect (sub_id, file_path)
    VALUES (?, ?)
    ON CONFLICT(sub_id) DO UPDATE SET
        file_path = excluded.file_path`,
        [row.sub_id, row.file_path]
    );
    return true;
}

export async function upsertManySubstrateDefects(
    rows: SubstrateDefectRow[]
): Promise<number> {
    if (!rows?.length) return 0;

    // Dedupe by sub_id (last-wins)
    const byId = new Map<string, SubstrateDefectRow>();
    for (const r of rows) if (r?.sub_id) byId.set(r.sub_id, r);
    const unique = Array.from(byId.values());
    if (!unique.length) return 0;

    const PARAMS_PER_ROW = 2;
    const limit = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(limit / PARAMS_PER_ROW));
    const chunk = <T,>(arr: T[], size: number) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

    const db = await getDb();
    await db.execute('BEGIN;');
    try {
        for (const c of chunk(unique, ROWS_PER_CHUNK)) {
            const placeholders = c.map(() => '(?, ?)').join(', ');
            const sql = `
        INSERT INTO substrate_defect (sub_id, file_path)
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

export async function deleteSubstrateDefectBySubId(sub_id: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM substrate_defect
    WHERE sub_id = ?`,
        [sub_id]
    );
    return true;
}

export async function deleteSubstrateDefectsByFilePath(file_path: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM substrate_defect
    WHERE file_path = ?`,
        [file_path]
    );
    return true;
}
