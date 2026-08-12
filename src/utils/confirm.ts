import { confirm } from '@tauri-apps/plugin-dialog';

/**
 * Native confirmation dialog via the Tauri dialog plugin.
 *
 * Do NOT use `window.confirm` in this app: Tauri's WKWebView on macOS does
 * not implement the blocking JS dialogs, so `window.confirm(...)` returns a
 * falsy value immediately without showing anything — guards written with it
 * silently cancel the action.
 */
export async function confirmAction(message: string, title = '确认操作'): Promise<boolean> {
    return confirm(message, { title, kind: 'warning' });
}
