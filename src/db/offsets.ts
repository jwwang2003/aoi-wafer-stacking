import { getDb, vacuum } from '@/db';
import type { OemProductOffset, OemProductOffsetMap } from './types';

// Adjust this if you actually created the table with a different name:
const TABLE = 'product_offsets';

/*
CREATE TABLE IF NOT EXISTS product_offsets (
    oem_product_id TEXT PRIMARY KEY,
    x_offset DOUBLE NOT NULL,
    y_offset DOUBLE NOT NULL,
    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_oem_product_offset_id ON oem_product_offset(oem_product_id);
*/

const COLUMNS = 'oem_product_id, x_offset, y_offset';

export async function getOemOffset(oem_product_id: string): Promise<OemProductOffset | null> {
    const db = await getDb();
    const rows = await db.select<OemProductOffset[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return rows[0] ?? null;
}

export async function getOemOffsets(
    oem_product_ids: string[]
): Promise<OemProductOffset[]> {
    if (!oem_product_ids.length) return [];
    const db = await getDb();
    const placeholders = oem_product_ids.map(() => '?').join(',');
    return db.select<OemProductOffset[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} WHERE oem_product_id IN (${placeholders})`,
        oem_product_ids
    );
}

export async function getAllOemOffsets(
    limit = 500,
    offset = 0
): Promise<OemProductOffset[]> {
    const db = await getDb();
    return db.select<OemProductOffset[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} ORDER BY oem_product_id ASC LIMIT ? OFFSET ?`,
        [limit, offset]
    );
}

/** Idempotent upsert by PK (oem_product_id). */
export async function upsertOemOffset(row: OemProductOffset): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO ${TABLE} (oem_product_id, x_offset, y_offset)
    VALUES (?, ?, ?)
ON CONFLICT(oem_product_id) DO UPDATE SET
    x_offset = excluded.x_offset,
    y_offset = excluded.y_offset`,
        [row.oem_product_id, row.x_offset, row.y_offset]
    );
    return true;
}

/** Bulk upsert inside a transaction. Returns count written. */
export async function upsertManyOemOffsets(rows: OemProductOffset[]): Promise<number> {
    if (!rows.length) return 0;
    const db = await getDb();
    await db.execute('BEGIN');
    try {
        for (const r of rows) {
            await db.execute(
                `INSERT INTO ${TABLE} (oem_product_id, x_offset, y_offset)
    VALUES (?, ?, ?)
ON CONFLICT(oem_product_id) DO UPDATE SET
    x_offset = excluded.x_offset,
    y_offset = excluded.y_offset`,
                [r.oem_product_id, r.x_offset, r.y_offset]
            );
        }
        await db.execute('COMMIT');
        return rows.length;
    } catch (e) {
        await db.execute('ROLLBACK');
        throw e;
    }
}

/** Delete one offset by id. Returns rows deleted (0/1). */
export async function deleteOemOffset(oem_product_id: string): Promise<number> {
    const db = await getDb();
    const res = await db.execute(
        `DELETE FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return (res as any)?.rowsAffected ?? 0;
}

/** Bulk delete by ids. Returns total rows deleted. */
export async function deleteManyOemOffsets(
    oem_product_ids: string[],
    batchSize = 500
): Promise<number> {
    if (!oem_product_ids.length) return 0;
    const db = await getDb();
    let total = 0;

    for (let i = 0; i < oem_product_ids.length; i += batchSize) {
        const batch = oem_product_ids.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');
        const res = await db.execute(
            `DELETE FROM ${TABLE} WHERE oem_product_id IN (${placeholders})`,
            batch
        );
        total += (res as any)?.rowsAffected ?? 0;
    }
    return total;
}

/** Delete all rows from product_offsets. Optionally VACUUM afterward. */
export async function deleteAllOemOffsets(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE}`);
    if (vacuumAfter) await vacuum();
    return (res as any)?.rowsAffected ?? 0;
}
/** Return a Map for quick lookups in code. */
export async function getOemOffsetMap(): Promise<OemProductOffsetMap> {
    const rows = await getAllOemOffsets(10_000, 0);
    return new Map(rows.map(r => [r.oem_product_id, { x_offset: r.x_offset, y_offset: r.y_offset }]));
}
