import { invoke } from "@tauri-apps/api/core";

/**
 * invoke helper
 * @param cmd 
 * @param payload 
 * @returns 
 */
export async function invokeSafe<T>(cmd: string, payload?: Record<string, unknown>): Promise<T> {
    try {
        return await invoke<T>(cmd, payload);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const out = `[tauri-invoke] ${cmd} failed: ${message}`;
        console.error(out);
        throw new Error(out);
    }
}