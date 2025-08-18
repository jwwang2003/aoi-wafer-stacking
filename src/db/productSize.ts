import { getDb, vacuum } from '@/db';

/** Row shape for product_size */
export type ProductSize = {
    oem_product_id: string;
    die_x: number;
    die_y: number;
};

/** Quick-lookup map: id -> { die_x, die_y } */
export type ProductSizeMap = Map<string, { die_x: number; die_y: number }>;

const TABLE = 'product_size';
const COLUMNS = 'oem_product_id, die_x, die_y';

/*
-- Keep for reference (should already exist):
CREATE TABLE IF NOT EXISTS product_size (
    oem_product_id TEXT PRIMARY KEY,
    die_x DOUBLE NOT NULL,
    die_y DOUBLE NOT NULL,
    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_size_id ON product_size(oem_product_id);
*/

export async function getProductSize(oem_product_id: string): Promise<ProductSize | null> {
    const db = await getDb();
    const rows = await db.select<ProductSize[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return rows[0] ?? null;
}

export async function getProductSizes(oem_product_ids: string[]): Promise<ProductSize[]> {
    if (!oem_product_ids.length) return [];
    const db = await getDb();
    const placeholders = oem_product_ids.map(() => '?').join(',');
    return db.select<ProductSize[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} WHERE oem_product_id IN (${placeholders})`,
        oem_product_ids
    );
}

export async function getAllProductSizes(limit = 500, offset = 0): Promise<ProductSize[]> {
    const db = await getDb();
    return db.select<ProductSize[]>(
        `SELECT ${COLUMNS} FROM ${TABLE} ORDER BY oem_product_id ASC LIMIT ? OFFSET ?`,
        [limit, offset]
    );
}

/** Idempotent upsert by PK (oem_product_id). */
export async function upsertProductSize(row: ProductSize): Promise<boolean> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO ${TABLE} (oem_product_id, die_x, die_y)
    VALUES (?, ?, ?)
    ON CONFLICT(oem_product_id) DO UPDATE SET
        die_x = excluded.die_x,
        die_y = excluded.die_y`,
        [row.oem_product_id, row.die_x, row.die_y]
    );
    return true;
}

/** Bulk upsert inside a transaction. Returns count written. */
export async function upsertManyProductSizes(rows: ProductSize[]): Promise<number> {
    if (!rows.length) return 0;
    const db = await getDb();
    await db.execute('BEGIN');
    try {
        for (const r of rows) {
            await db.execute(
                `INSERT INTO ${TABLE} (oem_product_id, die_x, die_y)
        VALUES (?, ?, ?)
        ON CONFLICT(oem_product_id) DO UPDATE SET
            die_x = excluded.die_x,
            die_y = excluded.die_y`,
                [r.oem_product_id, r.die_x, r.die_y]
            );
        }
        await db.execute('COMMIT');
        return rows.length;
    } catch (e) {
        await db.execute('ROLLBACK');
        throw e;
    }
}

/** Delete one by id. Returns rows deleted (0/1). */
export async function deleteProductSize(oem_product_id: string): Promise<number> {
    const db = await getDb();
    const res = await db.execute(
        `DELETE FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return (res as any)?.rowsAffected ?? 0;
}

/** Bulk delete by ids. Returns total rows deleted. */
export async function deleteManyProductSizes(oem_product_ids: string[], batchSize = 500): Promise<number> {
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

/** Delete all rows from product_size. Optionally VACUUM afterward. */
export async function deleteAllProductSizes(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE}`);
    if (vacuumAfter) await vacuum();
    return (res as any)?.rowsAffected ?? 0;
}

/** Return a Map for quick lookups in code. */
export async function getProductSizeMap(): Promise<ProductSizeMap> {
    const rows = await getAllProductSizes(10_000, 0);
    return new Map(rows.map(r => [r.oem_product_id, { die_x: r.die_x, die_y: r.die_y }]));
}