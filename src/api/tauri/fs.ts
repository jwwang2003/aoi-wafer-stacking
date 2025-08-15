import { DirResult } from '@/types/ipc';
import { invokeSafe } from '.';

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
    picked: string[] | DirResult[]
): Promise<DirResult[]> {
    const folders: FolderRequest[] =
        typeof picked[0] === 'string'
            ? (picked as string[]).map((p) => ({ path: p }))
            : (picked as FolderRequest[]);

    // If you want to de-dupe while preserving order:
    // const seen = new Set<string>();
    // const unique = folders.filter(f => (seen.has(f.path) ? false : (seen.add(f.path), true)));

    return await invokeSafe<DirResult[]>('rust_read_file_stat_batch', { folders });
}

/**
 * Invoke Rust to list direct children of a directory.
 * The Rust side should return children as FolderResult[] with absolute `path`
 * and `info.is_directory` / `info.is_file` flags.
 */
export async function invokeReadDir(rootPath: string): Promise<DirResult[]> {
    // exactly as you requested
    const entries = await invokeSafe<DirResult[]>('rust_read_dir', { dir: rootPath });
    return entries;
}

/**
 * Compute SHA1 hash in Rust.
 * @param input - The string to hash.
 * @returns Promise resolving to the SHA1 hash as a string.
 */
export async function invokeSha1(input: string): Promise<string> {
    return invokeSafe<string>('rust_sha1', { input });
}

/**
 * Compute SHA256 hash in Rust.
 * @param input - The string to hash.
 * @returns Promise resolving to the SHA256 hash as a string.
 */
export async function invokeSha256(input: string): Promise<string> {
    return invokeSafe<string>('rust_sha256', { input });
}