import { resolve } from '@tauri-apps/api/path';
import { stat } from '@tauri-apps/plugin-fs'; // or @tauri-apps/api/fs if you're using that

import { DirResult } from '@/types/ipc';
import { FileIndexRow, FolderIndexRow } from '@/db/types';
import { deleteFolderIndexesByPaths, getAllFolderIndexes, getManyFolderIndexesByPaths, upsertManyFolderIndexes, upsertOneFolderIndex } from '@/db/folderIndex';
import { invokeReadDir, invokeSha1Batch } from '@/api/tauri/fs';
import { deleteFileIndexesByPaths, getAllFileIndexes, getManyFileIndexesByPaths, upsertManyFileIndexes } from '@/db/fileIndex';

// ---------- Globals ----------
const file_idx = new Map<string, FileIndexRow>();
const folder_idx = new Map<string, FolderIndexRow>();

// Pending write-behind queues
const file_upserts: FileIndexRow[] = [];
const folder_upserts: FolderIndexRow[] = [];

const file_deletes: string[] = [];
const folder_deletes: string[] = [];

// Seen sets for a scan session (to detect deletions)
let seenFiles: Set<string> | null = null;
let seenFolders: Set<string> | null = null;

export function resetSessionFileIndexCache() {
    file_idx.clear();
    file_upserts.length = 0;
    file_deletes.length = 0;
}

export function resetSessionFolderIndexCache() {
    folder_idx.clear();
    folder_upserts.length = 0;
    folder_deletes.length = 0;
}

// ---------- Public API ----------

/** Load *all* index rows once into memory (fast path for ~100k). */
export async function warmIndexCaches(): Promise<void> {
    // Files
    const fileRows = await getAllFileIndexes();
    file_idx.clear();
    for (const [, r] of fileRows) {
        const k = norm(r.file_path);
        file_idx.set(k, r);
    }

    // Folders
    const folderRows = await getAllFolderIndexes();
    folder_idx.clear();
    for (const [, r] of folderRows) {
        const k = norm(r.folder_path);
        folder_idx.set(k, r);
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

// Internal helpers

function dedupeFileUpserts(rows: FileIndexRow[]): FileIndexRow[] {
    const m = new Map<string, FileIndexRow>();
    for (const r of rows) m.set(norm(r.file_path), r);
    return [...m.values()];
}
function dedupeFolderUpserts(rows: FolderIndexRow[]): FolderIndexRow[] {
    const m = new Map<string, FolderIndexRow>();
    for (const r of rows) m.set(norm(r.folder_path), r);
    return [...m.values()];
}

//==============================================================================

/** Drain queues in one go. Safe to call multiple times concurrently. */
export async function flushIndexQueues(): Promise<void> {
    // 1) Snapshot queues (new work will go to fresh arrays)
    const fileUp = file_upserts.splice(0, file_upserts.length);
    const folderUp = folder_upserts.splice(0, folder_upserts.length);
    const fileDel = file_deletes.splice(0, file_deletes.length);
    const folderDel = folder_deletes.splice(0, folder_deletes.length);

    const uniqFileUp = dedupeFileUpserts(fileUp);
    const uniqFolderUp = dedupeFolderUpserts(folderUp);

    // 2) Single transaction for everything (atomic)

    // NOTE: Another optimization would be to make this whole section chunked
    try {
        // Upserts (folders then files)
        if (uniqFolderUp.length) {
            try {
                await upsertManyFolderIndexes(uniqFolderUp);
            } catch (e) {
                console.error(1, e);
            }
        }
        if (uniqFileUp.length) {
            try {
                await upsertManyFileIndexes(uniqFileUp);
            } catch (e) {
                console.error(2, e);
            }

        }

        // Deletes (chunked)
        const CHUNK = 900;
        if (folderDel.length) {
            try {
                await deleteFolderIndexesByPaths(folderDel, CHUNK);
            } catch (e) {
                console.error(3, e);
            }
        }
        if (fileDel.length) {
            try {
                await deleteFileIndexesByPaths(fileDel, CHUNK);
            } catch (e) {
                console.error(4, e);
            }
        }

        // 3) Mirror to hot caches after success
        for (const r of uniqFolderUp) folder_idx.set(norm(r.folder_path), r);
        for (const r of uniqFileUp) file_idx.set(norm(r.file_path), r);
        for (const p of folderDel) folder_idx.delete(norm(p));
        for (const p of fileDel) file_idx.delete(norm(p));
    } catch (e) {
        console.error('Error while flushing indexes', e);
        throw e;
    }
}

//==============================================================================

type ScanKind = 'file' | 'dir';
type CachedRow = FileIndexRow | FolderIndexRow;

type ScanOptions = {
    root: string;
    name?: RegExp;
    kind: ScanKind;
    cache?: boolean;
    force?: boolean;
    entryFilter?: (entry: DirResult) => boolean;
    onProcess?: (path: string, mtime: number, entry: DirResult) => Promise<void> | void;
};

/** Shared scanner used by listDirs/listFiles/getSubfolders to reduce duplication. */
async function scanEntries({
    root,
    name,
    kind,
    cache = true,
    force = false,
    entryFilter,
    onProcess,
}: ScanOptions): Promise<{
    entries: DirResult[];
    cached: CachedRow[];
    totDir: number;
    numRead: number;
    numCached: number;
}> {
    let entries = await invokeReadDir(root);
    entries = entries
        .map(e => ({ ...e, path: norm(e.path) }))
        .filter(entryFilter ?? (e => kind === 'dir' ? e.info?.isDirectory : e.info?.isFile));

    const paths = entries.map(e => e.path);
    const totDir = entries.length;

    const re = safeRegex(name);
    const names = re ? paths.map(nameFromPath) : undefined;

    const indexMap: Map<string, CachedRow> = force
        ? new Map()
        : kind === 'dir'
            ? await getFolderIndexesWithLocalCache(paths, cache)
            : await getFileIndexesWithLocalCache(paths, cache);

    const cached: CachedRow[] = [];
    const out: DirResult[] = [];
    const pendingFileHashes: { path: string; mtime: number }[] = [];
    let numRead = 0, numCached = 0;

    // Default upsert handler if none provided
    const defaultProcess =
        kind === 'dir'
            ? async (path: string, mtime: number) => {
                if (!cache) return;
                folder_upserts.push({ folder_path: path, last_mtime: mtime });
            }
            : async (_path: string, _mtime: number) => {
                // no-op; file hashing is batched after the loop
            };

    const doProcess = onProcess ?? defaultProcess;
    const hasCustomProcess = Boolean(onProcess);

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const path = paths[i];
        const nameHere = names ? names[i] : nameFromPath(path);

        if (re && nameHere && !re.test(nameHere)) continue;

        const mtime = Number(entry.info?.mtime);

        const rec = force ? undefined : indexMap.get(path);
        if (rec && rec.last_mtime >= mtime) {
            cached.push(rec);
            numCached++;
            continue;
        }

        if (kind === 'file' && cache && !hasCustomProcess) {
            pendingFileHashes.push({ path, mtime });
        } else {
            await doProcess(path, mtime, entry);
        }
        out.push(entry);
        numRead++;
    }

    // Batch-hash files once (avoids per-file IPC)
    if (kind === 'file' && cache && pendingFileHashes.length) {
        const hashes = await invokeSha1Batch(pendingFileHashes.map(p => p.path));
        for (let i = 0; i < pendingFileHashes.length; i++) {
            const { path, mtime } = pendingFileHashes[i];
            const hash = hashes[i];
            file_upserts.push({ file_path: path, last_mtime: mtime, file_hash: hash });
        }
    }

    return { entries: out, cached, totDir, numRead, numCached };
}

//==============================================================================

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
    const { entries, totDir, numRead, numCached } = await scanEntries({
        root: rootPath,
        kind: 'dir',
        force,
        onProcess: async (path, mtime) => {
            // Keep immediate durability for upstream workflows
            await upsertOneFolderIndex({ folder_path: path, last_mtime: mtime });
        },
    });

    return {
        folders: entries.map(e => e.path),
        totDir,
        numRead,
        numCached,
    };
}

// Session-scoped cache

/**
 * Fetches first from the session-based memory cache, any folders not in the local cache,
 * the method makes a call to the DB to see if it exists.
 * @param paths 
 * @param force 
 * @returns 
 */
export async function getFolderIndexesWithLocalCache(
    paths: string[],
    force = false
): Promise<Map<string, FolderIndexRow>> {
    const out = new Map<string, FolderIndexRow>();
    if (!paths.length) return out;

    // if (force) {
    //     // Skip cache entirely, load all from DB
    //     const loaded = await getManyFolderIndexesByPaths(paths);
    //     // Store in local cache for future calls
    //     for (const [p, row] of loaded) folder_idx.set(p, row);
    //     return loaded;
    // }

    const misses: string[] = [];

    // Try local cache first
    for (const p of paths) {
        if (folder_idx.has(p)) {
            out.set(p, folder_idx.get(p)!);
        } else {
            misses.push(p);
        }
    }

    // Load only misses from DB
    if (!force && misses.length) {
        // Technically this should not happen if the local cache is properly in sync with the DB
        const loaded = await getManyFolderIndexesByPaths(misses);
        for (const [p, row] of loaded) {
            folder_idx.set(p, row);
            out.set(p, row);
        }
    }

    return out;
}

/**
 * Fetches first from the session-based memory cache, any files not in local cache,
 * the method makes a call to the DB to see if it exists.
 * @param paths 
 * @param force 
 * @returns 
 */
export async function getFileIndexesWithLocalCache(
    paths: string[],
    force = false
): Promise<Map<string, FileIndexRow>> {
    const out = new Map<string, FileIndexRow>();
    if (!paths.length) return out;

    // if (force) {
    //     const loaded = await getManyFileIndexesByPaths(paths);
    //     // 合并到缓存对象
    //     for (const [p, row] of loaded) {
    //         file_idx.set(p, row);
    //     }
    //     return loaded;
    // }

    const misses: string[] = [];

    for (const p of paths) {
        if (file_idx.has(p)) {
            out.set(p, file_idx.get(p)!);
        } else {
            misses.push(p);
        }
    }

    if (!force && misses.length) {
        const loaded = await getManyFileIndexesByPaths(misses);
        for (const [p, row] of loaded) {
            file_idx.set(p, row);
            out.set(p, row);
        }
    }

    return out;
}

export interface FsListOptions {
    root: string,
    name?: RegExp,
    force?: boolean,
    dirOnly?: boolean,
    cache?: boolean,
}

export async function listDirs(
    { root, name, dirOnly = true, cache = true }: FsListOptions
): Promise<{
    dirs: DirResult[];
    cached: FolderIndexRow[];
    totDir: number;
    numRead: number;
    numCached: number;
}> {
    const { entries, cached, totDir, numRead, numCached } = await scanEntries({
        root,
        name,
        kind: 'dir',
        cache,
        entryFilter: dirOnly ? (e) => Boolean(e.info?.isDirectory) : () => true,
        onProcess: async (path, mtime, entry) => {
            // Respect dirOnly guard while still reusing the common scanner
            if (dirOnly && !entry.info?.isDirectory) return;
            if (!cache) return;
            folder_upserts.push({ folder_path: path, last_mtime: mtime });
        },
    });

    const dirs = dirOnly ? entries.filter(e => e.info?.isDirectory) : entries;
    return { dirs, cached: cached as FolderIndexRow[], totDir, numRead, numCached };
}

export async function listFiles(
    { root, name, cache = true }: FsListOptions
): Promise<{ dirs: DirResult[]; cached: FileIndexRow[]; totDir: number; numRead: number; numCached: number }> {
    const { entries, cached, totDir, numRead, numCached } = await scanEntries({
        root,
        name,
        kind: 'file',
        cache,
    });

    return { dirs: entries, cached: cached as FileIndexRow[], totDir, numRead, numCached };
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

/**
 * Checks if two string arrays are equal
 * @param a 
 * @param b 
 * @returns 
 */
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

/**
 * Fast normalization that does not depend on Tauri's async API.
 * NOTE: Use with caution!
 * @param p 
 * @returns 
 */
export const norm = (p: string) => p.replace(/\\/g, '/'); // add .toLowerCase() if your FS is case-insensitive

/**
 * A wrapper drop-in for the Path's join method
 * @param root 
 * @param name 
 * @returns 
 */
export async function join(root: string, name: string) {
    return resolve(root, name);
}

export async function mtime(filePath: string): Promise<number> {
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
