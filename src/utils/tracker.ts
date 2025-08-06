import { stat, readTextFile } from '@tauri-apps/plugin-fs';
import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core'; // <-- NEW
import { DB_FILENAME } from '@/constants';

let dbInstance: Database | null = null;

async function getDb() {
    if (dbInstance) return dbInstance;

    const db = await Database.load(`sqlite:${DB_FILENAME}`);
    dbInstance = db;
    return db;
}

async function sha1(content: string): Promise<string> {
    return await invoke<string>('rust_sha1', { input: content });
}

export async function hasFolderChanged(folderPath: string): Promise<boolean> {
    if (!dbInstance) return false;

    const db = dbInstance;
    const meta = await stat(folderPath);
    const currentMtime = meta.mtime?.getTime() ?? 0;

    const result = await db.select<{ last_mtime: number }[]>(
        'SELECT last_mtime FROM folder_index WHERE folder_path = ?',
        [folderPath]
    );

    if (result.length === 0 || result[0].last_mtime < currentMtime) {
        return true;
    }
    return false;
}

export async function updateFolderIndex(folderPath: string): Promise<void> {
    if (!dbInstance) return;

    const db = dbInstance;
    const meta = await stat(folderPath);
    const mtime = meta.mtime?.getTime() ?? 0;

    await db.execute(`
INSERT INTO folder_index (folder_path, last_mtime)
VALUES (?, ?)
ON CONFLICT(folder_path) DO UPDATE SET last_mtime = excluded.last_mtime
`, [folderPath, mtime]);
}

export async function hasFileChanged(filePath: string, useHash = false): Promise<boolean> {
    if (!dbInstance) return false;

    const db = dbInstance;
    const meta = await stat(filePath);
    const currentMtime = meta.mtime?.getTime() ?? 0;

    const result = await db.select<{ last_mtime: number, file_hash?: string }[]>(
        'SELECT last_mtime, file_hash FROM file_index WHERE file_path = ?',
        [filePath]
    );

    if (result.length === 0) return true;

    const { last_mtime, file_hash } = result[0];
    if (currentMtime > last_mtime) {
        if (useHash) {
            const content = await readTextFile(filePath);
            const currentHash = await sha1(content);
            return currentHash !== file_hash;
        }
        return true;
    }
    return false;
}

export async function updateFileIndex(filePath: string, useHash = false): Promise<void> {
    const db = await getDb();
    const meta = await stat(filePath);
    const mtime = meta.mtime?.getTime() ?? 0;
    const hash = useHash ? await sha1(await readTextFile(filePath)) : null;

    await db.execute(`
INSERT INTO file_index (file_path, last_mtime, file_hash)
VALUES (?, ?, ?)
ON CONFLICT(file_path) DO UPDATE SET last_mtime = excluded.last_mtime, file_hash = excluded.file_hash
`, [filePath, mtime, hash]);
}
