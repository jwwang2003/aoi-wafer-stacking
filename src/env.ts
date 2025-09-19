// Centralized env access for frontend (Vite + Tauri)
// Use VITE_ prefix so Vite exposes it to the client.

// Default admin username is fixed in schema; only password is configurable.
type ViteEnv = { env: { VITE_ADMIN_DEFAULT_PASSWORD?: string } };
export const ADMIN_DEFAULT_PASSWORD: string =
  ((import.meta as unknown) as ViteEnv).env?.VITE_ADMIN_DEFAULT_PASSWORD ?? 'admin';

// Environment mode (prefer the canonical Vite flag MODE)
// Some setups may expose a lowercase `mode`; support both for safety.
// Usage: IS_PROD === true when running with `--mode production` or in a prod build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mode: string | undefined = (import.meta as any).env?.MODE ?? (import.meta as any).env?.mode;
export const IS_PROD: boolean = _mode === 'production';
export const IS_DEV: boolean = _mode === 'development';
