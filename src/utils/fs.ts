import { invokeSafe } from '@/api/tauri';
import { resolve, basename } from '@tauri-apps/api/path';
import { readDir, stat } from '@tauri-apps/plugin-fs'; // or @tauri-apps/api/fs if you're using that

import { FolderResult } from '@/types/DataSource';
import { FolderIndexRow } from '@/db/types';
import { getManyFolderIndexesByPaths, upsertOneFolderIndex } from '@/db/folderIndex';
import { invokeReadDir } from '@/api/tauri/fs';

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
): Promise<{ folders: string[]; totFolders: number; numRead: number; numCached: number }> {
    // const entries: FolderResult[] = await invokeSafe('rust_read_dir', { dir: rootPath });
    const entries: FolderResult[] = await invokeReadDir(rootPath);

    const folderNames = await Promise.all(entries.map((value) => basename(value.path)));
    const folderIndexes = !force
        ? await getManyFolderIndexesByPaths(folderNames)
        : new Map<string, FolderIndexRow>();

    const folders: string[] = [];
    let numRead = 0;
    let numCached = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const folderName = folderNames[i];

        if (!entry) continue;

        // Skip unchanged only when not forcing
        if (!force && folderIndexes.has(folderName)) {
            const rec = folderIndexes.get(folderName);
            if (
                rec &&
                entry.info &&
                entry.info.mtime &&
                rec.last_mtime >= Number(entry.info.mtime)
            ) {
                numCached += 1;
                continue;
            }
        }

        // Always upsert after deciding to (re)process, including when forcing
        upsertOneFolderIndex({
            folder_path: folderName,
            last_mtime: Number(entry.info?.mtime) ?? 0,
        });

        numRead += 1;
        folders.push(entry.path);
    }

    return {
        folders,
        totFolders: entries.length,
        numRead,
        numCached,
    };
}

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

type Entry = { name: string; isFile: boolean; isDirectory: boolean };

export async function listDirs(root: string, name?: RegExp): Promise<Entry[]> {
    const items = await readDir(root);
    const children = await invokeReadDir(root);
    return items.filter(d => d.isDirectory && (!name || name.test(d.name)));
}

export async function listFiles(root: string, name: RegExp): Promise<Entry[]> {
    const items = await readDir(root);
    return items.filter(f => f.isFile && name.test(f.name));
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
