import { getDb } from "@/db";
import { WaferMapRow } from "./types"; // Ensure this includes `idx?: number`

/**
 * NOTE: DB should enforce: CREATE UNIQUE INDEX IF NOT EXISTS uq_wafer_maps_file_path ON wafer_maps(file_path);
 *
 * Recommended WaferMapRow shape in ./types:
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
    const rows = await db.select<WaferMapRow[]>(
        `SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
    FROM wafer_maps
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
    return db.select<WaferMapRow[]>(
        `SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
    FROM wafer_maps
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
    const rows = await db.select<WaferMapRow[]>(
        `SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
    FROM wafer_maps
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
    const rows = await db.select<WaferMapRow[]>(
        `SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
    FROM wafer_maps
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
    return db.select<WaferMapRow[]>(
        `SELECT idx, product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path
    FROM wafer_maps
ORDER BY product_id, batch_id, wafer_id, COALESCE(time, 0) DESC, idx DESC
LIMIT ? OFFSET ?`,
        [limit, offset]
    );
}

/** Insert a new row (no idx). Will throw on duplicate file_path. Returns the new idx. */
export async function insertWaferMap(row: Omit<WaferMapRow, "idx">): Promise<number> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO wafer_maps
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
INSERT INTO wafer_maps
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
        await db.execute(
            `UPDATE wafer_maps
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
        `SELECT idx FROM wafer_maps WHERE file_path = ?`,
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
    rows: Array<Omit<WaferMapRow, "idx"> | WaferMapRow>
): Promise<number> {
    if (!rows.length) return 0;
    const db = await getDb();
    let written = 0;

    await db.execute("BEGIN");
    try {
        for (const r of rows) {
            await db.execute(UPSERT_ON_FILE_SQL, [
                r.product_id,
                r.batch_id,
                r.wafer_id,
                r.stage,
                r.sub_stage ?? null,
                r.retest_count ?? 0,
                r.time ?? null,
                r.file_path,
            ]);
            written += 1;
        }
        await db.execute("COMMIT");
        return written;
    } catch (e) {
        await db.execute("ROLLBACK");
        throw e;
    }
}

/** Bulk insert (no upsert) — use for brand-new files only. */
export async function insertManyWaferMaps(rows: Array<Omit<WaferMapRow, "idx">>): Promise<number> {
    if (!rows.length) return 0;
    const db = await getDb();
    await db.execute("BEGIN");
    try {
        for (const r of rows) {
            await db.execute(
                `INSERT INTO wafer_maps
    (product_id, batch_id, wafer_id, stage, sub_stage, retest_count, time, file_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    r.product_id,
                    r.batch_id,
                    r.wafer_id,
                    r.stage,
                    r.sub_stage ?? null,
                    r.retest_count ?? 0,
                    r.time ?? null,
                    r.file_path,
                ]
            );
        }
        await db.execute("COMMIT");
        return rows.length;
    } catch (e) {
        await db.execute("ROLLBACK");
        throw e;
    }
}

/** Delete one row by idx. Returns rows deleted (0/1). */
export async function deleteWaferMapByIdx(idx: number): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM wafer_maps WHERE idx = ?`, [idx]);
    return (res as any)?.rowsAffected ?? 0;
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
        `DELETE FROM wafer_maps WHERE product_id = ? AND batch_id = ? AND wafer_id = ?`,
        [product_id, batch_id, wafer_id]
    );
    return (res as any)?.rowsAffected ?? 0;
}

/** Delete by file_path (unique). */
export async function deleteWaferMapsByFilePath(file_path: string): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM wafer_maps WHERE file_path = ?`, [file_path]);
    return (res as any)?.rowsAffected ?? 0;
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
        const placeholders = batch.map(() => "?").join(",");
        const res = await db.execute(`DELETE FROM wafer_maps WHERE idx IN (${placeholders})`, batch);
        total += (res as any)?.rowsAffected ?? 0;
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
        const orClauses = batch.map(() => `(product_id = ? AND batch_id = ? AND wafer_id = ?)`).join(" OR ");
        const params = batch.flatMap(k => [k.product_id, k.batch_id, k.wafer_id]);
        const res = await db.execute(`DELETE FROM wafer_maps WHERE ${orClauses}`, params);
        total += (res as any)?.rowsAffected ?? 0;
    }
    return total;
}
