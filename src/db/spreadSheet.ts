import { getDb, MAX_PARAMS, vacuum, withRetry } from '@/db';
import { OemMapping, OemProductMapRow, ProductDefectMapRow, SubstrateDefectRow } from './types';

const OEM_MAP_TABLE = 'oem_product_map';

// =============================================================================
// NOTE: OEM ↔ Internal product mapping helpers
// =============================================================================

export async function getAllOemProductMappings(): Promise<OemProductMapRow[]> {
    const db = await getDb();
    return db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM ${OEM_MAP_TABLE}`
    );
}

export async function getOemProductMappingByOemId(
    oem_product_id: string
): Promise<OemProductMapRow | null> {
    const db = await getDb();
    const rows = await db.select<OemProductMapRow[]>(
        `SELECT oem_product_id, product_id
    FROM ${OEM_MAP_TABLE}
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
    FROM ${OEM_MAP_TABLE}
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
        `DELETE FROM ${OEM_MAP_TABLE}
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
        `DELETE FROM ${OEM_MAP_TABLE}
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
    FROM ${OEM_MAP_TABLE}
    WHERE oem_product_id = ? AND product_id = ?`,
        [oemProductId, productId]
    );
    if (existing[0]?.count > 0) return true;

    await db.execute(
        `INSERT INTO ${OEM_MAP_TABLE} (oem_product_id, product_id)
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

    const pairs = Array.from(byOem, ([oem_product_id, product_id]) => ({ oem_product_id, product_id }));
    if (pairs.length === 0) return { tot: 0, missing: [] };

    // Chunking by host parameter limit
    const PARAMS_PER_ROW = 2;
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let tot = 0;

    for (let i = 0; i < pairs.length; i += ROWS_PER_CHUNK) {
        const batch = pairs.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?)').join(', ');
        const sql = `
INSERT INTO ${OEM_MAP_TABLE} (oem_product_id, product_id)
VALUES ${placeholders}
ON CONFLICT(oem_product_id) DO UPDATE SET
    product_id = excluded.product_id
    `;

        const bindings: string[] = [];
        for (const r of batch) bindings.push(r.oem_product_id, r.product_id);

        // No explicit BEGIN/COMMIT — each execute is its own short implicit tx
        await withRetry(() => db.execute(sql, bindings));
        tot += batch.length;
    }

    // Compute "missing": current rows not present in incoming OEM set
    const current = await db.select<OemMapping[]>(
        `SELECT oem_product_id, product_id FROM ${OEM_MAP_TABLE}`
    );
    const incomingOems = new Set(pairs.map(p => p.oem_product_id));
    const missing = current.filter(row => !incomingOems.has(row.oem_product_id));

    return { tot, missing };
}

/** Delete all rows from oem_product_map. Optionally VACUUM afterward. */
export async function deleteAllOemProductMappings(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${OEM_MAP_TABLE}`);
    if (vacuumAfter) await vacuum();
    return (res && typeof res === 'object' && 'rowsAffected' in (res as object)
        ? (res as { rowsAffected?: number }).rowsAffected ?? 0
        : 0);
}

// =============================================================================
// NOTE: product_defect_map helpers
// =============================================================================

const PRODUCT_DEFECT_TABLE = 'product_defect_map';

/**
 * Get all rows in product_defect_map.
 */
export async function getAllProductDefectMaps(): Promise<ProductDefectMapRow[]> {
    const db = await getDb();
    return db.select<ProductDefectMapRow[]>(
        `SELECT oem_product_id, lot_id, wafer_id, sub_id, file_path
    FROM ${PRODUCT_DEFECT_TABLE}`
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
    const rows = await db.select<ProductDefectMapRow[]>(`
SELECT oem_product_id, lot_id, wafer_id, sub_id, file_path
FROM ${PRODUCT_DEFECT_TABLE}
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
FROM ${PRODUCT_DEFECT_TABLE}
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
    return db.select<{ lot_id: string }[]>(`
SELECT DISTINCT lot_id
FROM ${PRODUCT_DEFECT_TABLE}
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
    return db.select<{ wafer_id: string }[]>(`
SELECT DISTINCT wafer_id
FROM ${PRODUCT_DEFECT_TABLE}
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
    return db.select<{ sub_id: string; file_path: string }[]>(`
SELECT sub_id, file_path
FROM ${PRODUCT_DEFECT_TABLE}
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
    await db.execute(`
INSERT INTO ${PRODUCT_DEFECT_TABLE}
    oem_product_id, lot_id, wafer_id, sub_id, file_path)
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
    if (!rows?.length) return 0;

    const db = await getDb();

    // Dedupe by composite PK (last-wins) + warn on duplicates
    const byPk = new Map<string, ProductDefectMapRow>();
    const duplicates: ProductDefectMapRow[] = [];
    for (const r of rows) {
        if (!r.oem_product_id || !r.lot_id || !r.wafer_id) continue;
        const key = `${r.oem_product_id}|${r.lot_id}|${r.wafer_id}`;
        if (byPk.has(key)) duplicates.push(r);
        byPk.set(key, r);
    }
    if (duplicates.length) {
        console.warn('%c[upsertManyProductDefectMaps] Duplicate PK rows detected:', 'color: orange;', duplicates);
    }

    const unique = Array.from(byPk.values());
    if (!unique.length) return 0;

    // Chunking by host-parameter limit
    const PARAMS_PER_ROW = 5; // (oem_product_id, lot_id, wafer_id, sub_id, file_path)
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let written = 0;
    for (let i = 0; i < unique.length; i += ROWS_PER_CHUNK) {
        const batch = unique.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const sql = `
INSERT INTO ${PRODUCT_DEFECT_TABLE}
    (oem_product_id, lot_id, wafer_id, sub_id, file_path)
VALUES ${placeholders}
ON CONFLICT(oem_product_id, lot_id, wafer_id) DO UPDATE SET
    sub_id    = excluded.sub_id,
    file_path = excluded.file_path
    `;

        const bindings: string[] = [];
        for (const r of batch) bindings.push(r.oem_product_id, r.lot_id, r.wafer_id, r.sub_id, r.file_path);

        // No explicit BEGIN/COMMIT — each execute is its own short implicit tx
        await withRetry(() => db.execute(sql, bindings));
        written += batch.length;
    }

    return written;
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
    await db.execute(`
DELETE FROM ${PRODUCT_DEFECT_TABLE}
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
    await db.execute(`
DELETE FROM ${PRODUCT_DEFECT_TABLE}
WHERE file_path = ?`,
        [file_path]
    );
    return true;
}

/** Delete all rows from product_defect_map. Optionally VACUUM afterward. */
export async function deleteAllProductDefectMaps(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${PRODUCT_DEFECT_TABLE}`);
    if (vacuumAfter) await vacuum();
    return (res && typeof res === 'object' && 'rowsAffected' in (res as object)
        ? (res as { rowsAffected?: number }).rowsAffected ?? 0
        : 0);
}

// =============================================================================
// NOTE: substrate_defect helpers
// =============================================================================

const SUBSTRATE_TABLE = 'substrate_defect';

export async function getAllSubstrateDefects(): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    return db.select<SubstrateDefectRow[]>(`
SELECT sub_id, file_path
FROM ${SUBSTRATE_TABLE}`
    );
}

export async function getSubstrateDefectBySubId(sub_id: string): Promise<SubstrateDefectRow | null> {
    const db = await getDb();
    const rows = await db.select<SubstrateDefectRow[]>(`
SELECT sub_id, file_path
FROM ${SUBSTRATE_TABLE}
WHERE sub_id = ?`,
        [sub_id]
    );
    return rows[0] ?? null;
}

export async function getSubstrateDefectsByFilePath(file_path: string): Promise<SubstrateDefectRow[]> {
    const db = await getDb();
    return db.select<SubstrateDefectRow[]>(`
SELECT sub_id, file_path
FROM ${SUBSTRATE_TABLE}
WHERE file_path = ?`,
        [file_path]
    );
}

export async function upsertSubstrateDefect(row: SubstrateDefectRow): Promise<boolean> {
    const db = await getDb();
    await db.execute(`
INSERT INTO ${SUBSTRATE_TABLE} (sub_id, file_path)
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

    const db = await getDb();

    // 2 params per row: (sub_id, file_path)
    const PARAMS_PER_ROW = 2;
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let written = 0;
    for (let i = 0; i < unique.length; i += ROWS_PER_CHUNK) {
        const batch = unique.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?)').join(', ');
        const sql = `
INSERT INTO ${SUBSTRATE_TABLE} (sub_id, file_path)
VALUES ${placeholders}
ON CONFLICT(sub_id) DO UPDATE SET
    file_path = excluded.file_path
    `;

        const bindings: Array<string> = [];
        for (const r of batch) bindings.push(r.sub_id, r.file_path);

        // No explicit BEGIN/COMMIT — each execute is its own short implicit tx
        await withRetry(() => db.execute(sql, bindings));
        written += batch.length;
    }

    return written;
}

export async function deleteSubstrateDefectBySubId(sub_id: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(`
DELETE FROM ${SUBSTRATE_TABLE}
WHERE sub_id = ?`,
        [sub_id]
    );
    return true;
}

export async function deleteSubstrateDefectsByFilePath(file_path: string): Promise<boolean> {
    const db = await getDb();
    await db.execute(`
DELETE FROM ${SUBSTRATE_TABLE}
WHERE file_path = ?`,
        [file_path]
    );
    return true;
}

/** Delete all rows from substrate_defect. Optionally VACUUM afterward. */
export async function deleteAllSubstrateDefects(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${SUBSTRATE_TABLE}`);
    if (vacuumAfter) await vacuum();
    return (res && typeof res === 'object' && 'rowsAffected' in (res as object)
        ? (res as { rowsAffected?: number }).rowsAffected ?? 0
        : 0);
}

// =============================================================================
/**
 * Wipe wafer_maps, substrate_defect, product_defect_map, and oem_product_map
 * in that order (children → parent), then VACUUM once (default true).
 */
const rows = (r: unknown) => (r && typeof r === 'object' && 'rowsAffected' in (r as object)
    ? (r as { rowsAffected?: number }).rowsAffected ?? 0
    : 0);
export async function resetSpreadSheetData(options: { vacuumAfter?: boolean } = {}): Promise<{
    deletedWaferMaps: number;
    deletedSubstrateDefects: number;
    deletedProductDefects: number;
    deletedOemMappings: number;
}> {
    const { vacuumAfter = true } = options;
    const db = await getDb();

    const deletedWaferMaps = 0;
    let deletedSubstrateDefects = 0;
    let deletedProductDefects = 0;
    let deletedOemMappings = 0;

    // Grab the write lock up front; omit trailing semicolons to avoid driver quirks
    try {
        const r1 = await db.execute(`DELETE FROM ${SUBSTRATE_TABLE}`);
        const r2 = await db.execute(`DELETE FROM ${PRODUCT_DEFECT_TABLE}`);
        const r3 = await db.execute(`DELETE FROM ${OEM_MAP_TABLE}`);

        deletedSubstrateDefects = rows(r1);
        deletedProductDefects = rows(r2);
        deletedOemMappings = rows(r3);
    } catch (e) {
        console.error(e);
        throw e;
    }

    if (vacuumAfter) await vacuum();

    return {
        deletedWaferMaps,
        deletedSubstrateDefects,
        deletedProductDefects,
        deletedOemMappings,
    };
}
