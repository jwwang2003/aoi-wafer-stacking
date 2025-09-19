import { getDb, MAX_PARAMS, vacuum, withRetry, existingSet as getExistingSet } from '@/db';
import { WaferMapRow } from './types'; // Ensure this includes "idx?: number"

const TABLE = 'wafer_maps';

type ExecResult = { rowsAffected?: number } | void | null | undefined;
function rowsAffected(res: ExecResult): number {
    return (res && typeof res === 'object' && 'rowsAffected' in res ? (res as { rowsAffected?: number }).rowsAffected : undefined) ?? 0;
}

/**
 * NOTE: DB should enforce: CREATE UNIQUE INDEX IF NOT EXISTS uq_wafer_maps_file_path ON wafer_maps(file_path);
 *
 * export interface WaferMapRow {
 *   idx?: number;              // autoincrement PK
 *   product_id: string;
 *   batch_id: string;
 *   wafer_id: number;          // INTEGER in DB
 *   stage: string;
 *   sub_stage: string | null;
 *   retest_count: number;      // default 0
 *   time: number | null;       // epoch ms
 *   file_path: string;         // UNIQUE
 * }
 */

/** Get one row by idx (PK). */
export async function getWaferMapByIdx(idx: number): Promise<WaferMapRow | null> {
    const db = await getDb();
    const rows = await db.select<WaferMapRow[]>(`
SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
FROM ${TABLE}
WHERE idx = ?`,
        [idx]
    );
    return rows[0] ?? null;
}

/** Get ALL rows for a (product, batch, wafer) triple (multiple retests possible). */
export async function getWaferMapsByTriple(
    product_id: string,
    batch_id: string,
    wafer_id: number
): Promise<WaferMapRow[]> {
    const db = await getDb();
    return db.select<WaferMapRow[]>(`
SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
FROM ${TABLE}
WHERE product_id = ? AND batch_id = ? AND wafer_id = ?
ORDER BY COALESCE(time, 0) DESC, idx DESC`,
        [product_id, batch_id, wafer_id]
    );
}

/** Get the LATEST row (by time, then idx) for a triple. */
export async function getLatestWaferMapByTriple(
    product_id: string,
    batch_id: string,
    wafer_id: number
): Promise<WaferMapRow | null> {
    const db = await getDb();
    const rows = await db.select<WaferMapRow[]>(`
SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
FROM ${TABLE}
WHERE product_id = ? AND batch_id = ? AND wafer_id = ?
ORDER BY COALESCE(time, 0) DESC, idx DESC
LIMIT 1`,
        [product_id, batch_id, wafer_id]
    );
    return rows[0] ?? null;
}

/** BACK-COMPAT: previously returned a single row by composite PK — now returns the latest. */
export const getWaferMap = getLatestWaferMapByTriple;

/** Get exactly one row by its unique file_path. */
export async function getWaferMapByFilePath(file_path: string): Promise<WaferMapRow | null> {
    const db = await getDb();
    const rows = await db.select<WaferMapRow[]>(`
SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
FROM ${TABLE}
WHERE file_path = ?`,
        [file_path]
    );
    return rows[0] ?? null;
}

/** BACK-COMPAT: old plural name; now returns 0 or 1 row wrapped in an array. */
export async function getWaferMapsByFilePath(file_path: string): Promise<WaferMapRow[]> {
    const row = await getWaferMapByFilePath(file_path);
    return row ? [row] : [];
}

/** Fetch paginated list (simple browser) */
export async function getAllWaferMaps(
    limit = 200,
    offset = 0
): Promise<WaferMapRow[]> {
    const db = await getDb();
    return db.select<WaferMapRow[]>(`
SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
FROM ${TABLE}
ORDER BY product_id, batch_id, wafer_id, COALESCE(time, 0) DESC, idx DESC
LIMIT ? OFFSET ?`,
        [limit, offset]
    );
}

/** Insert a new row (no idx). Will throw on duplicate file_path. Returns the new idx. */
export async function insertWaferMap(row: Omit<WaferMapRow, 'idx'>): Promise<number> {
    const db = await getDb();
    await db.execute(`
INSERT INTO ${TABLE}
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.product_id,
            row.batch_id,
            row.wafer_id,
            row.stage,
            row.sub_stage ?? null,
            row.retest_count ?? 0,
            row.time ?? null,
            row.file_path,
        ]
    );
    const got = await db.select<{ last_id: number }[]>(
        `SELECT last_insert_rowid() AS last_id`
    );
    return got[0]?.last_id ?? -1;
}

/** Reusable SQL: idempotent upsert on unique file_path. */
const UPSERT_ON_FILE_SQL = `
INSERT INTO ${TABLE}
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(file_path) DO UPDATE SET
    product_id   = excluded.product_id,
    batch_id     = excluded.batch_id,
    wafer_id     = excluded.wafer_id,
    stage        = excluded.stage,
    sub_stage    = excluded.sub_stage,
    retest_count = excluded.retest_count,
    time         = excluded.time
`;

/**
 * Upsert:
 * - If `row.idx` provided → UPDATE that `idx`
 * - Else                  → UPSERT by unique `file_path`
 * Returns the affected row idx.
 */
export async function upsertWaferMap(row: WaferMapRow): Promise<number> {
    const db = await getDb();

    if (row.idx != null) {
        await db.execute(`
UPDATE ${TABLE}
SET product_id = ?,
    batch_id = ?,
    wafer_id = ?,
    stage = ?,
    sub_stage = ?,
    retest_count = ?,
    time = ?,
    file_path = ?
WHERE idx = ?`,
            [
                row.product_id,
                row.batch_id,
                row.wafer_id,
                row.stage,
                row.sub_stage ?? null,
                row.retest_count ?? 0,
                row.time ?? null,
                row.file_path,
                row.idx,
            ]
        );
        return row.idx;
    }

    // No idx → upsert by file
    await db.execute(UPSERT_ON_FILE_SQL, [
        row.product_id,
        row.batch_id,
        row.wafer_id,
        row.stage,
        row.sub_stage ?? null,
        row.retest_count ?? 0,
        row.time ?? null,
        row.file_path,
    ]);

    const got = await db.select<{ idx: number }[]>(
        `SELECT idx FROM ${TABLE} WHERE file_path = ?`,
        [row.file_path]
    );
    return got[0]?.idx ?? -1;
}

/**
 * Upsert many rows by unique file_path in one transaction.
 * `idx` (if provided) is ignored in favor of file uniqueness for idempotent ingestion.
 * Returns number of rows written (inserted or updated).
 */
export async function upsertManyWaferMaps(
    rows: Array<Omit<WaferMapRow, 'idx'> | WaferMapRow>
): Promise<number> {
    if (!rows?.length) return 0;
    const db = await getDb();

    // Last-wins de-dupe by file_path (UPSERT key)
    const byFile = new Map<string, Omit<WaferMapRow, 'idx'> | WaferMapRow>();
    for (const r of rows) if (r?.file_path) byFile.set(r.file_path, r);
    let unique = Array.from(byFile.values());
    if (!unique.length) return 0;

    // Preflight FK: product_id must exist in oem_product_map(product_id)
    const productIds = Array.from(new Set(unique.map(r => String(r.product_id)).filter(Boolean)));
    const existingProducts = await getExistingSet('oem_product_map', 'product_id', productIds);
    const before = unique.length;
    unique = unique.filter(r => existingProducts.has(String(r.product_id)));
    const skippedFk = before - unique.length;
    if (skippedFk > 0) {
        console.warn(`[wafermaps] Skipping ${skippedFk} rows due to missing product_id in oem_product_map`);
    }
    if (!unique.length) return 0;

    // params per row:
    // (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
    const PARAMS_PER_ROW = 8;
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let written = 0;
    for (let i = 0; i < unique.length; i += ROWS_PER_CHUNK) {
        const batch = unique.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const sql = `
INSERT INTO ${TABLE}
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES ${placeholders}
ON CONFLICT(file_path) DO UPDATE SET
    product_id   = excluded.product_id,
    batch_id     = excluded.batch_id,
    wafer_id     = excluded.wafer_id,
    stage        = excluded.stage,
    sub_stage    = excluded.sub_stage,
    retest_count = excluded.retest_count,
    time         = excluded.time
    `;

        const params: Array<string | number | null> = [];
        for (const r of batch) {
            params.push(
                r.product_id,
                r.batch_id,
                r.wafer_id,
                r.stage,
                r.sub_stage ?? null,
                r.retest_count ?? 0,
                r.time ?? null,
                r.file_path
            );
        }

        // No explicit BEGIN/COMMIT — each execute is a short implicit transaction
        await withRetry(() => db.execute(sql, params));
        written += batch.length;
    }

    return written;
}

/** Upsert many with statistics (by unique file_path). */
export async function upsertManyWaferMapsWithStats(
    rows: Array<Omit<WaferMapRow, 'idx'> | WaferMapRow>
): Promise<{
    written: number;
    unique: number;
    duplicates: number;
    duplicateFiles: string[];
    existing: number;
    insertedFiles: string[];
    updatedFiles: string[];
    fkMissingFiles: string[];
    fkMissingProductIds: string[];
}> {
    if (!rows?.length) return { written: 0, unique: 0, duplicates: 0, duplicateFiles: [], existing: 0, insertedFiles: [], updatedFiles: [], fkMissingFiles: [], fkMissingProductIds: [] };
    const db = await getDb();

    // De-dupe by file_path and count duplicates
    const byFile = new Map<string, Omit<WaferMapRow, 'idx'> | WaferMapRow>();
    let duplicateCount = 0;
    const duplicateSet = new Set<string>();
    for (const r of rows) {
        if (!r?.file_path) continue;
        if (byFile.has(r.file_path)) {
            duplicateCount += 1;
            duplicateSet.add(r.file_path);
        }
        byFile.set(r.file_path, r);
    }
    let unique = Array.from(byFile.values());
    if (!unique.length) return { written: 0, unique: 0, duplicates: duplicateCount, duplicateFiles: [], existing: 0, insertedFiles: [], updatedFiles: [], fkMissingFiles: [], fkMissingProductIds: [] };

    // FK preflight: product_id must exist
    const productIds = Array.from(new Set(unique.map(r => String(r.product_id)).filter(Boolean)));
    const existingProducts = await getExistingSet('oem_product_map', 'product_id', productIds);
    const fkMissing = unique.filter(r => !existingProducts.has(String(r.product_id)));
    const fkMissingFiles = fkMissing.map(r => r.file_path);
    const fkMissingProductIds = Array.from(new Set(fkMissing.map(r => String(r.product_id))));
    unique = unique.filter(r => existingProducts.has(String(r.product_id)));
    if (!unique.length) return { written: 0, unique: 0, duplicates: duplicateCount, duplicateFiles: Array.from(duplicateSet), existing: 0, insertedFiles: [], updatedFiles: [], fkMissingFiles, fkMissingProductIds };

    const files = unique.map(r => r.file_path);

    // Find existing file_paths in DB in chunks using IN (...)
    const existingSet = new Set<string>();
    const ROWS_PER_CHUNK = 300;
    for (let i = 0; i < files.length; i += ROWS_PER_CHUNK) {
        const batch = files.slice(i, i + ROWS_PER_CHUNK);
        const placeholders = batch.map(() => '?').join(',');
        const found = await db.select<{ file_path: string }[]>(
            `SELECT file_path FROM ${TABLE} WHERE file_path IN (${placeholders})`,
            batch
        );
        for (const f of found) existingSet.add(f.file_path);
    }

    const updatedFiles: string[] = [];
    const insertedFiles: string[] = [];
    for (const fp of files) (existingSet.has(fp) ? updatedFiles : insertedFiles).push(fp);

    // Perform UPSERT in same fashion
    const PARAMS_PER_ROW = 8;
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_INSERT = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let written = 0;
    for (let i = 0; i < unique.length; i += ROWS_PER_INSERT) {
        const batch = unique.slice(i, i + ROWS_PER_INSERT);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const sql = `
INSERT INTO ${TABLE}
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES ${placeholders}
ON CONFLICT(file_path) DO UPDATE SET
    product_id   = excluded.product_id,
    batch_id     = excluded.batch_id,
    wafer_id     = excluded.wafer_id,
    stage        = excluded.stage,
    sub_stage    = excluded.sub_stage,
    retest_count = excluded.retest_count,
    time         = excluded.time
        `;
        const params: Array<string | number | null> = [];
        for (const r of batch) {
            params.push(
                r.product_id,
                r.batch_id,
                r.wafer_id,
                r.stage,
                r.sub_stage ?? null,
                r.retest_count ?? 0,
                r.time ?? null,
                r.file_path
            );
        }
        await withRetry(() => db.execute(sql, params));
        written += batch.length;
    }

    return {
        written,
        unique: unique.length,
        duplicates: duplicateCount,
        duplicateFiles: Array.from(duplicateSet),
        existing: existingSet.size,
        insertedFiles,
        updatedFiles,
        fkMissingFiles,
        fkMissingProductIds,
    };
}

/** Bulk insert (no upsert) — use for brand-new files only. */
export async function insertManyWaferMaps(
    rows: Array<Omit<WaferMapRow, 'idx'>>
): Promise<number> {
    if (!rows?.length) return 0;

    const db = await getDb();

    // 8 params per row
    const PARAMS_PER_ROW = 8;
    const LIMIT = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(LIMIT / PARAMS_PER_ROW));

    let inserted = 0;

    for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
        const batch = rows.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const sql = `
INSERT INTO ${TABLE}
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES ${placeholders}
    `;

        const params: Array<string | number | null> = [];
        for (const r of batch) {
            params.push(
                r.product_id,
                r.batch_id,
                r.wafer_id,
                r.stage,
                r.sub_stage ?? null,
                r.retest_count ?? 0,
                r.time ?? null,
                r.file_path
            );
        }

        // No explicit BEGIN/COMMIT — each execute is a short implicit transaction
        await withRetry(() => db.execute(sql, params));
        inserted += batch.length;
    }

    return inserted;
}

/** Delete one row by idx. Returns rows deleted (0/1). */
export async function deleteWaferMapByIdx(idx: number): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE} WHERE idx = ?`, [idx]);
    return rowsAffected(res);
}

/**
 * Delete ALL rows for a triple (useful to purge all retests of that wafer).
 * Returns rows deleted.
 */
export async function deleteWaferMapsByTriple(
    product_id: string,
    batch_id: string,
    wafer_id: number
): Promise<number> {
    const db = await getDb();
    const res = await db.execute(
        `DELETE FROM ${TABLE} WHERE product_id = ? AND batch_id = ? AND wafer_id = ?`,
        [product_id, batch_id, wafer_id]
    );
    return rowsAffected(res);
}

/** Delete by file_path (unique). */
export async function deleteWaferMapsByFilePath(file_path: string): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE} WHERE file_path = ?`, [file_path]);
    return rowsAffected(res);
}

/** Bulk delete by idx (batched). */
export async function deleteManyWaferMapsByIdx(
    idxs: number[],
    batchSize = 500
): Promise<number> {
    if (!idxs.length) return 0;
    const db = await getDb();
    let total = 0;
    for (let i = 0; i < idxs.length; i += batchSize) {
        const batch = idxs.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');
        const res = await db.execute(`DELETE FROM ${TABLE} WHERE idx IN (${placeholders})`, batch);
        total += rowsAffected(res);
    }
    return total;
}

/** (Kept) Bulk delete by composite triples — removes *all* retests for each triple. */
export async function deleteManyWaferMapsByPK(
    keys: Array<{ product_id: string; batch_id: string; wafer_id: number }>,
    batchSize = 300
): Promise<number> {
    if (!keys.length) return 0;
    const db = await getDb();
    let total = 0;

    for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const orClauses = batch.map(() => `(product_id = ? AND batch_id = ? AND wafer_id = ?)`).join(' OR ');
        const params = batch.flatMap(k => [k.product_id, k.batch_id, k.wafer_id]);
        const res = await db.execute(`DELETE FROM ${TABLE} WHERE ${orClauses}`, params);
        total += rowsAffected(res);
    }
    return total;
}

/** Delete all rows from wafer_maps. Optionally VACUUM afterward. */
export async function deleteAllWaferMaps(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE};`);
    if (vacuumAfter) await vacuum();
    return rowsAffected(res);
}
