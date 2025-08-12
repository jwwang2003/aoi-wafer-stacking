import { resolve } from '@tauri-apps/api/path';
import { stat } from '@tauri-apps/plugin-fs'; // or @tauri-apps/api/fs if you're using that

import { FolderResult } from '@/types/DataSource';
import { FileIndexRow, FolderIndexRow } from '@/db/types';
import { deleteFolderIndexesByPaths, getManyFolderIndexesByPaths, upsertOneFolderIndex } from '@/db/folderIndex';
import { invokeReadDir, invokeSha1 } from '@/api/tauri/fs';
import { deleteFileIndexesByPaths, getManyFileIndexesByPaths } from '@/db/fileIndex';
import { getDb } from '@/db';

// ---------- Globals ----------
const file_idx = new Map<string, { last_mtime: number; file_hash?: string | null }>();
const folder_idx = new Map<string, { last_mtime: number }>();

// Pending write-behind queues
const file_upserts: FileIndexRow[] = [];
const folder_upserts: FolderIndexRow[] = [];

const file_deletes: string[] = [];
const folder_deletes: string[] = [];

// Seen sets for a scan session (to detect deletions)
let seenFiles: Set<string> | null = null;
let seenFolders: Set<string> | null = null;

// Flush controls
const FLUSH_BATCH = 1000;
let flushing = false;

// ---------- Normalization ----------
const norm = (p: string) => p.replace(/\\/g, '/'); // add .toLowerCase() if your FS is case-insensitive

// ---------- Public API ----------

/** Load *all* index rows once into memory (fast path for ~100k). */
export async function warmIndexCaches(): Promise<void> {
    // Files
    const db = await getDb();
    const fileRows = await db.select<FileIndexRow[]>(
        `SELECT file_path, last_mtime, file_hash FROM file_index`
    );
    file_idx.clear();
    for (const r of fileRows) {
        const k = norm(r.file_path);
        file_idx.set(k, { last_mtime: r.last_mtime, file_hash: r.file_hash ?? null });
    }

    // Folders
    const folderRows = await db.select<FolderIndexRow[]>(
        `SELECT folder_path, last_mtime FROM folder_index`
    );
    folder_idx.clear();
    for (const r of folderRows) {
        const k = norm(r.folder_path);
        folder_idx.set(k, { last_mtime: r.last_mtime });
    }
}

/** Begin a new scan session; enables stale-row sweeping later. */
export function beginScanSession(): void {
    seenFiles = new Set<string>();
    seenFolders = new Set<string>();
}

/** Mark a file/folder as seen during the current scan session. */
export function markSeenFile(path: string): void {
    if (seenFiles) seenFiles.add(norm(path));
}
export function markSeenFolder(path: string): void {
    if (seenFolders) seenFolders.add(norm(path));
}

/** After a scan, delete rows not seen this time (both in DB and in-memory). */
export async function endScanSession(): Promise<void> {
    if (!seenFiles || !seenFolders) return;

    // Sweep files
    {
        const toDelete: string[] = [];
        for (const k of file_idx.keys()) {
            if (!seenFiles.has(k)) toDelete.push(k);
        }
        if (toDelete.length) {
            await deleteFileIndexesByPaths(toDelete);
            for (const k of toDelete) file_idx.delete(k);
        }
    }

    // Sweep folders
    {
        const toDelete: string[] = [];
        for (const k of folder_idx.keys()) {
            if (!seenFolders.has(k)) toDelete.push(k);
        }
        if (toDelete.length) {
            await deleteFolderIndexesByPaths(toDelete);
            for (const k of toDelete) folder_idx.delete(k);
        }
    }

    seenFiles = null;
    seenFolders = null;
}

/** Get cached file meta (undefined if unknown). */
export function getFileIndex(path: string) {
    return file_idx.get(norm(path));
}

/** Get cached folder meta (undefined if unknown). */
export function getFolderIndex(path: string) {
    return folder_idx.get(norm(path));
}

/**
 * Scan a directory and return the **subfolders that need processing**.
 *
 * When `force` is `false` (default), this function:
 *  1) Reads direct children of `rootPath` (files are ignored).
 *  2) Looks up each child folder in the `folder_index` table (by **basename**).
 *  3) Compares cached `last_mtime` with the current folder mtime.
 *     - If cache mtime >= current mtime → considered **unchanged** and **skipped**.
 *     - Otherwise → considered **new/modified**, **returned**, and cache is **upserted**.
 *
 * When `force` is `true`, the cache is **ignored** and **all** direct subfolders
 * are returned and **upserted** into the cache with the current mtime.
 *
 * Notes:
 *  - Folder mtime is expected to be **epoch milliseconds** (number) from the backend.
 *  - Cache key uses **basename**. If identical names can appear under different parents,
 *    prefer a **root-relative path** as the cache key to avoid collisions.
 *
 * Performance:
 *  - O(n) over direct entries. Basename resolution is parallelized with `Promise.all`.
 *
 * @param {string} rootPath Absolute path of the directory to scan (direct children only).
 * @param {boolean} [force=false] If true, bypass cache and process **all** subfolders.
 * @returns {Promise<{folders:string[], totFolders:number, numRead:number, numCached:number}>}
 *  - `folders`: full paths of subfolders to process
 *  - `totFolders`: total number of direct subfolders discovered
 *  - `numRead`: number that will be (re)read this run
 *  - `numCached`: number skipped due to valid cache (0 when `force=true`)
 */
export async function getSubfolders(
    rootPath: string,
    force: boolean = false
): Promise<{ folders: string[]; totDir: number; numRead: number; numCached: number }> {
    // 1) Read children once and filter to directories
    let entries: FolderResult[] = await invokeReadDir(rootPath);
    entries = entries.filter(e => e.info?.isDirectory);

    const paths = entries.map(e => norm(e.path));
    const totDir = entries.length;

    // 2) Warm cache map for these paths (skip when forcing)
    const indexMap: Map<string, FolderIndexRow> = !force
        ? await getManyFolderIndexesByPaths(paths)
        : new Map<string, FolderIndexRow>();

    // 3) Decide which to read vs. skip
    const folders: string[] = [];
    let numRead = 0;
    let numCached = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const path = paths[i];
        const mtime = Number(entry.info?.mtime) ?? null;

        if (!force) {
            const rec = indexMap.get(path);
            if (rec && rec.last_mtime >= mtime) {
                numCached++;
                continue;
            }
        }

        // Upsert after deciding to (re)process (await for durability; or batch upstream)
        await upsertOneFolderIndex({
            folder_path: path,
            last_mtime: mtime,
        });

        folders.push(path);
        numRead++;
    }

    return { folders, totDir, numRead, numCached };
}

export interface FsListOptions {
    root: string,
    name?: RegExp,
    force?: boolean,
    dirOnly?: boolean,
    cache?: boolean,
}

export async function listDirs(
    { root, name, force = false, dirOnly = true, cache = true }: FsListOptions
): Promise<{
    listed: FolderResult[];
    cached: FolderIndexRow[];
    totDir: number;
    numRead: number;
    numCached: number;
}> {
    // 1) Read once and filter to directories early
    let entries = await invokeReadDir(root);
    entries = entries.filter(e => !dirOnly || e.info?.isDirectory);

    // Normalize paths once; re-use everywhere
    const paths = entries.map(e => norm(e.path));
    const totDir = entries.length;

    // 2) Prep optional name filter (fast, no async)
    const re = safeRegex(name);
    const names = re ? paths.map(nameFromPath) : undefined;

    // 3) Bulk-fetch cache rows for these paths (skip if forcing)
    const indexMap: Map<string, FolderIndexRow> = !force
        ? await getManyFolderIndexesByPaths(paths)
        : new Map();

    const listed: FolderResult[] = [];
    const cached: FolderIndexRow[] = [];
    let numRead = 0, numCached = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const path = paths[i];
        const nameHere = names ? names[i] : undefined;

        // Filter by name if provided
        if (re && nameHere && !re.test(nameHere)) continue;

        const entryMtime = Number(entry.info?.mtime);

        if (!force) {
            const rec = indexMap.get(path);
            if (rec && rec.last_mtime >= entryMtime) {
                cached.push(rec);
                numCached++;
                continue;
            }
        }

        // Queue cache write; update after the loop
        if (cache) {
            // Stage cache upserts; flush once at end (avoids per-row await)
            folder_upserts.push({ folder_path: path, last_mtime: entryMtime });
        }

        listed.push(entry);
        numRead++;
    }

    return { listed, cached, totDir, numRead, numCached };
}

export async function listFiles(
    { root, name, force = false, cache = true }: FsListOptions
): Promise<{ files: string[]; cached: FileIndexRow[]; totDir: number; numRead: number; numCached: number }> {
    // 1) Read once and keep only files
    let entries = await invokeReadDir(root);
    entries = entries.filter(e => e.info?.isFile);

    // Normalize paths once
    const paths = entries.map(e => norm(e.path));
    const totDir = entries.length;

    // 2) Optional filename filter (sync + cheap)
    const re = safeRegex(name);
    const names = re ? paths.map(nameFromPath) : undefined;

    // 3) Bulk cache lookup (skip when forcing)
    const indexMap: Map<string, FileIndexRow> = !force
        ? await getManyFileIndexesByPaths(paths)
        : new Map<string, FileIndexRow>();

    const files: string[] = [];
    const cached: FileIndexRow[] = [];
    let numRead = 0, numCached = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const path = paths[i];
        const fileName = names ? names[i] : nameFromPath(path);

        if (re && !re.test(fileName)) continue;

        const mtime = Number(entry.info?.mtime);

        if (!force) {
            const rec = indexMap.get(path);
            if (rec && rec.last_mtime >= mtime) {
                cached.push(rec);
                numCached++;
                continue;
            }
        }

        if (cache) {
            // Stage DB upserts; flush once (replace with upsertMany for max speed)
            file_upserts.push({ file_path: path, last_mtime: mtime, file_hash: await invokeSha1(path) });
        }

        files.push(fileName);
        numRead++;
    }

    return { files, cached, totDir, numRead, numCached };
}

// =============================================================================

export const safeRegex = (re?: RegExp) => re ? new RegExp(re.source, re.flags.replace('g', '')) : undefined;
export const pathMtime = (x: { info?: { mtime?: number | Date } }) =>
    x?.info?.mtime != null ? Number(x.info.mtime) : 0;
export const nameFromPath = (p: string) => (p.split(/[\\/]/).pop() ?? '');

/**
 * Sorts an array of full folder paths alphabetically based on their subfolder names.
 *
 * This function extracts the last segment of each path (i.e., the folder name)
 * and performs a locale-aware alphabetical sort using `String.prototype.localeCompare`.
 * 
 * Useful for maintaining consistent UI display and ensuring order-insensitive comparisons.
 *
 * @param paths - An array of full directory paths (e.g., ['/path/to/AOI-001', '/path/to/AOI-010']).
 * @returns A new array of paths sorted by the subfolder name.
 */
export function sortBySubfolderName(paths: string[]): string[] {
    return [...paths].sort((a, b) => {
        const nameA = a.split(/[\\/]/).pop() ?? '';
        const nameB = b.split(/[\\/]/).pop() ?? '';
        return nameA.localeCompare(nameB);
    });
}

export function arraysAreEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
}

/**
 * Convert absolute path to a path relative to the root directory.
 */
export function getRelativePath(rootPath: string, fullPath: string): string {
    if (!fullPath.startsWith(rootPath)) return fullPath; // fallback, avoid invalid slicing
    return fullPath.slice(rootPath.length).replace(/^[/\\]/, '');
}

export async function join(root: string, name: string) {
    return resolve(root, name);
}

export async function mtimeMs(filePath: string): Promise<number> {
    const info = await stat(filePath);
    return info.mtime?.getTime() ?? -1;
}

export function match(re: RegExp, s: string) {
    const m = re.exec(s);
    return m ? Array.from(m) : null; // [full, g1, g2...]
}

export function assertOrLog(cond: boolean, msg: string, extra?: unknown): boolean {
    if (!cond) {
        console.error(msg, extra ?? '');
        return false;
    }
    return true;
}
