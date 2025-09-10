// Centralized env access for frontend (Vite + Tauri)
// Use VITE_ prefix so Vite exposes it to the client.

// Default admin username is fixed in schema; only password is configurable.
type ViteEnv = { env: { VITE_ADMIN_DEFAULT_PASSWORD?: string } };
export const ADMIN_DEFAULT_PASSWORD: string =
  ((import.meta as unknown) as ViteEnv).env?.VITE_ADMIN_DEFAULT_PASSWORD ?? 'admin';
