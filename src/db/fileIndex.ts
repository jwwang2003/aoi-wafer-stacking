import { getDb } from '@/db';
import { FileIndexRow } from './types';
import { resetSessionFileIndexCache } from '@/utils/fs';

/**
 * Retrieves a single file index record by its path.
 *
 * @param file_path - The relative file path to look up.
 * @returns The matching `FileIndexRow` if found, otherwise `null`.
 */
export async function getFileIndexByPath(file_path: string): Promise<FileIndexRow | null> {
    const db = await getDb();
    const rows = await db.select<FileIndexRow[]>(
        `SELECT file_path, last_mtime, file_hash FROM file_index WHERE file_path = ?`,
        [file_path]
    );
    return rows[0] ?? null;
}

/**
 * Retrieves multiple file index records by their paths.
 *
 * @param paths - An array of relative file paths.
 * @returns A `Map` keyed by `file_path` containing the matching `FileIndexRow` entries.
 *          If `paths` is empty, an empty map is returned.
 */
export async function getManyFileIndexesByPaths(paths: string[]): Promise<Map<string, FileIndexRow>> {
    const map = new Map<string, FileIndexRow>();
    if (paths.length === 0) return map;

    const db = await getDb();
    const qs = paths.map(() => '?').join(',');
    const rows = await db.select<FileIndexRow[]>(
        `SELECT file_path, last_mtime, file_hash
    FROM file_index
    WHERE file_path IN (${qs})`,
        paths
    );
    for (const r of rows) map.set(r.file_path, r);
    return map;
}

/**
 * Retrieves all file index records in ascending order by file path.
 *
 * @returns A `Map` keyed by `file_path` containing all `FileIndexRow` entries.
 */
export async function getAllFileIndexes(): Promise<Map<string, FileIndexRow>> {
    const map = new Map<string, FileIndexRow>();
    const db = await getDb();

    const rows = await db.select<FileIndexRow[]>(
        `SELECT file_path, last_mtime, file_hash
    FROM file_index
    ORDER BY file_path ASC`
    );
    for (const r of rows) map.set(r.file_path, r);
    return map;
}

/**
 * Inserts or updates a single file index record.
 * If the `file_path` already exists, updates its `last_mtime` and `file_hash`.
 *
 * @param entry - The file index row to insert or update.
 */
export async function upsertOneFileIndex(entry: FileIndexRow): Promise<void> {
    const db = await getDb();
    await db.execute(
        `INSERT INTO file_index (file_path, last_mtime, file_hash)
    VALUES (?, ?, ?)
    ON CONFLICT(file_path)
    DO UPDATE SET last_mtime=excluded.last_mtime, file_hash=excluded.file_hash`,
        [entry.file_path, entry.last_mtime, entry.file_hash ?? null]
    );
}

/**
 * Inserts or updates multiple file index records in a single transaction.
 * Rolls back if any insert fails.
 *
 * @param entries - An array of file index rows to insert or update.
 */
export async function upsertManyFileIndexes(entries: FileIndexRow[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await getDb();
    try {
        await db.execute('BEGIN');
        for (const e of entries) {
            await db.execute(
                `INSERT INTO file_index (file_path, last_mtime, file_hash)
    VALUES (?, ?, ?)
    ON CONFLICT(file_path)
    DO UPDATE SET last_mtime=excluded.last_mtime, file_hash=excluded.file_hash`,
                [e.file_path, e.last_mtime, e.file_hash ?? null]
            );
        }
        await db.execute('COMMIT');
    } catch (err) {
        console.error('Error while upserting file indexes');
        await db.execute('ROLLBACK');
        throw err;
    }
}

/**
 * Deletes a single file index record by its path.
 *
 * @param file_path - The relative file path to delete.
 */
export async function deleteFileIndexByPath(file_path: string): Promise<void> {
    const db = await getDb();
    await db.execute(
        `DELETE FROM file_index WHERE file_path = ?`,
        [file_path]
    );
}

/**
 * Deletes multiple file index records by their paths.
 *
 * @param file_paths - Array of relative file paths to delete.
 */
export async function deleteFileIndexesByPaths(file_paths: string[], batchSize = 500): Promise<void> {
    if (!file_paths.length) return;

    const db = await getDb();

    for (let i = 0; i < file_paths.length; i += batchSize) {
        const batch = file_paths.slice(i, i + batchSize);
        const placeholders = batch.map(() => '?').join(',');
        await db.execute(
            `DELETE FROM file_index WHERE file_path IN (${placeholders})`,
            batch
        );
    }
}

/**
 * Deletes all records from the file_index table.
 *
 * ⚠️ Use with caution — this will clear all file tracking data,
 * forcing all files to be treated as 'new' on the next scan.
 */
export async function deleteAllFileIndexes(): Promise<void> {
    const db = await getDb();
    resetSessionFileIndexCache();
    await db.execute(`DELETE FROM file_index`);
}
