import { resetSessionFolderIndexCache } from '@/utils/fs';
import { getDb, MAX_PARAMS, vacuum, withRetry } from './index';
import { FolderIndexRow } from './types';

const TABLE = 'folder_index';

// CREATE TABLE IF NOT EXISTS folder_index (
//     folder_path TEXT PRIMARY KEY,
//     last_mtime INTEGER
// );

/**
 * Retrieves a single folder index record by its path.
 *
 * @param folder_path - The relative path of the folder to look up.
 * @returns A `FolderIndexRow` if found, otherwise `null`.
 */
export async function getFolderIndexByPath(folder_path: string): Promise<FolderIndexRow | null> {
    const db = await getDb();
    const rows = await db.select<FolderIndexRow[]>(
        `SELECT folder_path, last_mtime FROM ${TABLE} WHERE folder_path = ?`,
        [folder_path]
    );
    return rows[0] ?? null;
}

/**
 * Retrieves multiple folder index records by their paths.
 *
 * @param paths - An array of relative folder paths.
 * @returns A `Map` keyed by `folder_path` containing matching `FolderIndexRow` entries.
 *          If `paths` is empty, an empty map is returned.
 */
export async function getManyFolderIndexesByPaths(paths: string[]): Promise<Map<string, FolderIndexRow>> {
    const map = new Map<string, FolderIndexRow>();
    if (paths.length === 0) return map;

    const db = await getDb();
    const qs = paths.map(() => '?').join(',');
    const rows = await db.select<FolderIndexRow[]>(`
SELECT folder_path, last_mtime
FROM ${TABLE}
WHERE folder_path IN (${qs})`, paths);
    for (const r of rows) map.set(r.folder_path, r);
    return map;
}

/**
 * Retrieves all folder index records in ascending order by folder path.
 *
 * @returns A `Map` keyed by `folder_path` containing all `FolderIndexRow` entries.
 */
export async function getAllFolderIndexes(): Promise<Map<string, FolderIndexRow>> {
    const map = new Map<string, FolderIndexRow>();
    const db = await getDb();

    const rows = await db.select<FolderIndexRow[]>(`
SELECT folder_path, last_mtime
FROM ${TABLE}
ORDER BY folder_path ASC;`);

    for (const r of rows) map.set(r.folder_path, r);
    return map;
}

/**
 * Inserts or updates a single folder index record.
 * If the `folder_path` already exists, updates its `last_mtime`.
 *
 * @param entry - The folder index row to insert or update.
 */
export async function upsertOneFolderIndex(entry: FolderIndexRow): Promise<void> {
    const db = await getDb();
    await db.execute(`
INSERT INTO ${TABLE} (folder_path, last_mtime)
VALUES ($1, $2)
ON CONFLICT(folder_path) DO UPDATE SET 
    last_mtime=excluded.last_mtime`,
        [entry.folder_path, entry.last_mtime]
    );
}

/**
 * Inserts or updates multiple folder index records.
 * If any insert fails, the transaction is rolled back.
 * 
 * NOTE: This is non-transacted, TBD: implement a transacted version on the rust side.
 *
 * @param entries - An array of folder index rows to insert or update.
 */
export async function upsertManyFolderIndexes(entries: FolderIndexRow[]): Promise<void> {
    if (!entries?.length) return;

    // Optional: last-wins de-dup by path
    const byPath = new Map<string, FolderIndexRow>();
    for (const e of entries) if (e?.folder_path) byPath.set(e.folder_path, e);
    const unique = Array.from(byPath.values());
    if (!unique.length) return;

    const db = await getDb();

    // 2 params per row: (folder_path, last_mtime)
    const PARAMS_PER_ROW = 2;
    const MAX = typeof MAX_PARAMS === 'number' ? MAX_PARAMS : 999;
    const ROWS_PER_CHUNK = Math.max(1, Math.floor(MAX / PARAMS_PER_ROW));

    for (let i = 0; i < unique.length; i += ROWS_PER_CHUNK) {
        const batch = unique.slice(i, i + ROWS_PER_CHUNK);

        const placeholders = batch.map(() => '(?, ?)').join(', ');
        const sql = `
INSERT INTO ${TABLE} (folder_path, last_mtime)
VALUES ${placeholders}
ON CONFLICT(folder_path) DO UPDATE SET
    last_mtime = excluded.last_mtime
    `;

        const params: Array<string | number> = [];
        for (const e of batch) params.push(e.folder_path, e.last_mtime);

        // No BEGIN/COMMIT — each execute is its own short implicit tx
        await withRetry(() => db.execute(sql, params));
    }
}

/**
 * Deletes a single folder index record by its path.
 *
 * @param folder_path - The relative file path to delete.
 */
export async function deleteFolderIndexByPath(file_path: string): Promise<void> {
    const db = await getDb();
    await db.execute(`DELETE FROM ${TABLE} WHERE folder_path = ?`, [file_path]);
}

/**
 * Deletes multiple folder index records by their paths, in batches.
 *
 * @param folder_paths - Array of relative folder paths to delete.
 * @param batchSize - Max items per DELETE (default 500; keep < 999 for SQLite param limit).
 */
export async function deleteFolderIndexesByPaths(
    folder_paths: string[],
    batchSize = 500
): Promise<void> {
    if (!folder_paths.length) return;

    // Be safe under SQLite"s typical 999 bound-parameter limit
    const CHUNK = Math.max(1, Math.min(batchSize, 900));

    const db = await getDb();
    for (let i = 0; i < folder_paths.length; i += CHUNK) {
        const batch = folder_paths.slice(i, i + CHUNK);
        const placeholders = batch.map(() => '?').join(',');
        await db.execute(`DELETE FROM ${TABLE} WHERE folder_path IN (${placeholders})`, batch);
    }
}

/**
 * Deletes all records from the folder_index table.
 *
 * ⚠️ Use with caution — this will remove all folder tracking information
 * and force the application to treat every folder as "new" on the next scan.
 */
export async function deleteAllFolderIndexes(vacuumAfter = false): Promise<number> {
    const db = await getDb();
    const res = await db.execute(`DELETE FROM ${TABLE}`);
    if (vacuumAfter) await vacuum();
    await resetSessionFolderIndexCache();
    return (res as any)?.rowsAffected ?? 0;
}