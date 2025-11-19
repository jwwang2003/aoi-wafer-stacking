/**
 * Product size (DIE size, in mm units)
 * - DIE width
 * - DIE height
 * 
 * ONLY unique for each oem_product_id
 */

import { getDb, vacuum } from '@/db';
import { ProductSize, ProductSizeMap } from './types';

const TABLE = 'product_size';
const COLUMNS = 'oem_product_id, die_x, die_y';
type ExecResult = { rowsAffected?: number } | void | null | undefined;
const rowsAffected = (res: ExecResult): number => (res && typeof res === 'object' && 'rowsAffected' in res ? (res as { rowsAffected?: number }).rowsAffected ?? 0 : 0);

/*
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
    await db.execute(`
INSERT INTO ${TABLE} (oem_product_id, die_x, die_y)
VALUES (?, ?, ?)
ON CONFLICT(oem_product_id) DO UPDATE SET
    die_x = excluded.die_x,
    die_y = excluded.die_y`,
        [row.oem_product_id, row.die_x, row.die_y]
    );
    return true;
}

/** Delete one by id. Returns rows deleted (0/1). */
export async function deleteProductSize(oem_product_id: string): Promise<number> {
    const db = await getDb();
    const res = await db.execute(
        `DELETE FROM ${TABLE} WHERE oem_product_id = ?`,
        [oem_product_id]
    );
    return rowsAffected(res);
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
        total += rowsAffected(res);
    }
    return total;
}

/** Delete all rows from product_size. Optionally VACUUM afterward. */
export async function deleteAllProductSizes(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE}`);
    if (vacuumAfter) await vacuum();
    return rowsAffected(res);
}

/** Return a Map for quick lookups in code. */
export async function getProductSizeMap(): Promise<ProductSizeMap> {
    const rows = await getAllProductSizes(10_000, 0);
    return new Map(rows.map(r => [r.oem_product_id, { die_x: r.die_x, die_y: r.die_y }]));
}
