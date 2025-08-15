import { resetSessionFolderIndexCache } from '@/utils/fs';
import { getDb } from './index';
import { FolderIndexRow } from './types';

// Current:
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
        `SELECT folder_path, last_mtime FROM folder_index WHERE folder_path = ?`,
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
    const rows = await db.select<FolderIndexRow[]>(
        `SELECT folder_path, last_mtime
    FROM folder_index
    WHERE folder_path IN (${qs})`,
        paths
    );
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

    const rows = await db.select<FolderIndexRow[]>(
        `SELECT folder_path, last_mtime
    FROM folder_index
    ORDER BY folder_path ASC`
    );

    for (const r of rows) {
        map.set(r.folder_path, r);
    }
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
    await db.execute(
        `INSERT INTO folder_index (folder_path, last_mtime)
    VALUES (?, ?)
    ON CONFLICT(folder_path)
    DO UPDATE SET last_mtime=excluded.last_mtime`,
        [entry.folder_path, entry.last_mtime]
    );
}

/**
 * Inserts or updates multiple folder index records in a single transaction.
 * If any insert fails, the transaction is rolled back.
 *
 * @param entries - An array of folder index rows to insert or update.
 */
export async function upsertManyFolderIndexes(entries: FolderIndexRow[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await getDb();
    try {
        await db.execute('BEGIN');
        for (const e of entries) {
            await db.execute(
                `INSERT INTO folder_index (folder_path, last_mtime)
    VALUES (?, ?)
    ON CONFLICT(folder_path)
    DO UPDATE SET last_mtime=excluded.last_mtime`,
                [e.folder_path, e.last_mtime]
            );
        }
        await db.execute('COMMIT');
    } catch (err) {
        console.error('Error while upserting folder indexes');
        await db.execute('ROLLBACK');
        throw err;
    }
}

/**
 * Deletes a single folder index record by its path.
 *
 * @param folder_path - The relative file path to delete.
 */
export async function deleteFolderIndexByPath(file_path: string): Promise<void> {
    const db = await getDb();
    console.info(await db.execute(
        `DELETE FROM folder_index WHERE folder_path = ?`
        , [file_path]
    ));
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
        await db.execute(
            `DELETE FROM folder_index WHERE folder_path IN (${placeholders})`,
            batch
        );
    }
}


/**
 * Deletes all records from the folder_index table.
 *
 * ⚠️ Use with caution — this will remove all folder tracking information
 * and force the application to treat every folder as "new" on the next scan.
 */
export async function deleteAllFolderIndexes(): Promise<void> {
    const db = await getDb();
    resetSessionFolderIndexCache();
    await db.execute(`DELETE FROM folder_index`);
}