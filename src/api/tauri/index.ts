// ===== invoke helper =====
async function invokeSafe<T>(cmd: string, payload?: Record<string, unknown>): Promise<T> {
    try {
        // @ts-expect-error payload may be undefined by design
        return await invoke<T>(cmd, payload);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[tauri] ${cmd} failed: ${message}`);
    }
}