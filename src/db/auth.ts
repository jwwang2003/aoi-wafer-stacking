import { getDb } from './index';
import { AuthRole } from '@/types/auth';
import { ADMIN_DEFAULT_PASSWORD } from '@/env';

/**
 * Validate credentials by role. For Admin, matches any user with role='admin' and password.
 * For User, matches any user with role='user' and password.
 * Returns the matched username if successful; otherwise null.
 */
export async function validateByRole(role: AuthRole.Admin | AuthRole.User, password: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ username: string }[]>(
    'SELECT username FROM auth WHERE role = ? AND password = ? LIMIT 1',
    [role, password]
  );
  if (rows.length > 0) return rows[0].username;
  return null;
}

/** Validate admin by fixed username 'admin' and password; returns 'admin' on success. */
export async function validateAdmin(password: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ username: string }[]>(
    'SELECT username FROM auth WHERE username = ? AND role = ? AND password = ? LIMIT 1',
    ['admin', AuthRole.Admin, password]
  );
  if (rows.length > 0) return rows[0].username;
  return null;
}

/** Validate a regular user with explicit username and password; returns username on success. */
export async function validateUser(username: string, password: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ username: string }[]>(
    'SELECT username FROM auth WHERE username = ? AND role = ? AND password = ? LIMIT 1',
    [username, AuthRole.User, password]
  );
  if (rows.length > 0) return rows[0].username;
  return null;
}

/** Returns true if the seeded default admin password is still in place. */
export async function isAdminPasswordDefault(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number }[]>(
    'SELECT COUNT(1) as cnt FROM auth WHERE username = ? AND role = ? AND password = ? LIMIT 1',
    ['admin', AuthRole.Admin, ADMIN_DEFAULT_PASSWORD]
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

/** Update the admin password (username = 'admin'). Returns rowsAffected. */
export async function updateAdminPassword(newPassword: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute('UPDATE auth SET password = ? WHERE username = ? AND role = ?', [newPassword, 'admin', AuthRole.Admin]);
  return res?.rowsAffected ?? 0;
}

/**
 * If the DB still has the seed password ('admin'), and an env default is provided
 * (different from 'admin'), update the admin password to the env default.
 * Returns true if an update was performed.
 */
export async function maybeApplyEnvAdminDefault(): Promise<boolean> {
  // If env default is the same as seed, nothing to do.
  if (ADMIN_DEFAULT_PASSWORD === 'admin') return false;

  const db = await getDb();
  const rows = await db.select<{ password: string }[]>(
    'SELECT password FROM auth WHERE username = ? AND role = ? LIMIT 1',
    ['admin', AuthRole.Admin]
  );
  const current = rows[0]?.password ?? null;

  // Only auto-change if it's still the seed value.
  if (current === 'admin') {
    const changed = await updateAdminPassword(ADMIN_DEFAULT_PASSWORD);
    return changed > 0;
  }
  return false;
}

// =====================
// User management (role='user')
// =====================

export type AuthUser = { username: string; role: AuthRole };

/** List all regular users (role='user'). */
export async function listUsers(): Promise<AuthUser[]> {
  const db = await getDb();
  const rows = await db.select<AuthUser[]>(
    'SELECT username, role FROM auth WHERE role = ? ORDER BY username',
    [AuthRole.User]
  );
  return rows;
}

/** Create a new user with role='user'. Returns rowsAffected. */
export async function createUser(username: string, password: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    'INSERT OR IGNORE INTO auth (username, role, password) VALUES (?, ?, ?)',
    [username, AuthRole.User, password]
  );
  return res?.rowsAffected ?? 0;
}

/** Update an existing user's password (role='user'). Returns rowsAffected. */
export async function updateUserPassword(username: string, newPassword: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    'UPDATE auth SET password = ? WHERE username = ? AND role = ?',
    [newPassword, username, AuthRole.User]
  );
  return res?.rowsAffected ?? 0;
}

/** Delete a user by username (only role='user'). Returns rowsAffected. */
export async function deleteUser(username: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    'DELETE FROM auth WHERE username = ? AND role = ?',
    [username, AuthRole.User]
  );
  return res?.rowsAffected ?? 0;
}
