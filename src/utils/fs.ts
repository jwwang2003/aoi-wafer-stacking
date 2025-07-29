import { readDir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

/**
 * Gets full paths of direct subfolders (not files) under a given directory.
 * @param rootPath The base directory
 * @returns An array of full subfolder paths
 */
export async function getSubfolders(rootPath: string): Promise<string[]> {
    const entries = await readDir(rootPath);

    const folders: string[] = [];

    for (const entry of entries) {
        if (entry !== undefined) {
            const fullPath = await join(rootPath, entry.name);
            folders.push(fullPath);
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