import { basename, join } from '@tauri-apps/api/path';

import { FolderIndexRow } from '@/db/types';
import { getManyFolderIndexesByPaths, upsertOneFolderIndex } from '@/db/folderIndex';

import { FolderResult } from '@/types/DataSource';
import { invoke } from '@tauri-apps/api/core';

/**
 * Scan a directory and return the **subfolders that need processing**.
 *
 * When `index_cache` is `true` (default), this function:
 *  1) Reads direct children of `rootPath` (files are ignored).
 *  2) Looks up each child folder in the `folder_index` table (by **basename**).
 *  3) Compares the cached `last_mtime` with the current folder mtime.
 *     - If cache mtime >= current mtime → considered **unchanged**, it is **skipped**.
 *     - Otherwise → considered **new/modified**, it is **returned** and the cache is **upserted**.
 *
 * When `index_cache` is `false`, no cache read/write happens and **all** direct subfolder paths
 * are returned.
 *
 * ⚠️ Side effects (only when `index_cache = true`):
 *  - Reads many folder rows via `getManyFolderIndexesByPaths(basenames)`.
 *  - Upserts `folder_index` with `{ folder_path: basename, last_mtime }` for scanned folders.
 *
 * Notes:
 *  - Folder mtime is expected to be **epoch milliseconds** (number) coming from the backend.
 *  - Cache key uses **basename**. If you can have the same folder name under different parents,
 *    prefer using a **path relative to your root** as the key to avoid collisions.
 *
 * Performance:
 *  - O(n) over direct entries. Basename resolution is parallelized with `Promise.all`.
 *
 * @param {string} rootPath Absolute path of the directory to scan (direct children only).
 * @param {boolean} [index_cache=true] Use/maintain the DB cache to skip unchanged folders.
 * @returns {Promise<string[]>}
 *  - If `index_cache = true`: full paths of **new or modified** subfolders.
 *  - If `index_cache = false`: full paths of **all** direct subfolders.
 */
export async function getSubfolders(rootPath: string, index_cache: boolean = true): Promise<string[]> {
    const entries: FolderResult[] = await invoke('read_dir', { dir: rootPath });

    // const folderNames = entries.flatMap((value) => await basename(value.path));
    const folderNames = await Promise.all(
        entries.map((value) => basename(value.path))
    );
    const folderIndexes = index_cache ? await getManyFolderIndexesByPaths(folderNames) : new Map<string, FolderIndexRow>();

    const folders: string[] = [];

    // Loop through both arrays together
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];         // FolderResult
        const folderName = folderNames[i]; // string from basename

        if (entry !== undefined) {
            if (index_cache && folderIndexes.has(folderName)) {
                const rec = folderIndexes.get(folderName);
                console.debug(rec!.last_mtime, Number(entry.info?.mtime));
                if (
                    rec && entry.info && entry.info.mtime &&
                    rec.last_mtime >= Number(entry.info.mtime)  // checks that the mtime inside of the DB is up-to-date
                ) {
                    // Folder cache is still valid -> skip
                    continue;
                }
            }
            if (index_cache) {
                // Folder cache is not valid or DNE, create/update it
                upsertOneFolderIndex({
                    folder_path: folderName,
                    last_mtime: Number(entry.info?.mtime) ?? 0
                });
            }
            folders.push(entry.path);
        }
    }

    return folders;
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