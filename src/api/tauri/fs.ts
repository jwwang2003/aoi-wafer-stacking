import { FolderResult } from "@/types/DataSource";
import { invokeSafe } from ".";

export interface FolderRequest { path: string };

/**
 * Batch stat files/folders via the Rust command `rust_read_file_stat_batch`.
 * Accepts either an array of paths or an array of `{ path }` objects.
 *
 * @param picked Array of absolute paths or `{ path }` objects
 * @returns Promise<FolderResult[]>
 *
 * Usage:
 *   const results = await readFileStatBatch(['/a/b', '/x/y']);
 *   const results = await readFileStatBatch([{ path: '/a/b' }, { path: '/x/y' }]);
 */
export async function invokeReadFileStatBatch(
    picked: string[] | FolderResult[]
): Promise<FolderResult[]> {
    const folders: FolderRequest[] =
        typeof picked[0] === 'string'
            ? (picked as string[]).map((p) => ({ path: p }))
            : (picked as FolderRequest[]);

    // If you want to de-dupe while preserving order:
    // const seen = new Set<string>();
    // const unique = folders.filter(f => (seen.has(f.path) ? false : (seen.add(f.path), true)));

    return await invokeSafe<FolderResult[]>('rust_read_file_stat_batch', { folders });
}

/**
 * Invoke Rust to list direct children of a directory.
 * The Rust side should return children as FolderResult[] with absolute `path`
 * and `info.is_directory` / `info.is_file` flags.
 */
export async function invokeReadDir(rootPath: string): Promise<FolderResult[]> {
    // exactly as you requested
    const entries = await invokeSafe<FolderResult[]>('rust_read_dir', { dir: rootPath });
    return entries;
}