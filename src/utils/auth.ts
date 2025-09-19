import { AuthRole } from '@/types/auth';

/**
 * Returns true if the current user is privileged (admin or user).
 * Accepts either a role value or an object with `auth.role` (e.g. Redux state).
 * If role is guest (or missing), returns false.
 */
type WithAuthRole = { auth?: { role?: AuthRole } };

function extractRole(arg: AuthRole | WithAuthRole | null | undefined): AuthRole | undefined {
    if (typeof arg === 'string') return arg as AuthRole;
    if (arg && typeof arg === 'object') {
        return (arg as WithAuthRole).auth?.role;
    }
    return undefined;
}

export function isPrivileged(arg: AuthRole | WithAuthRole | null | undefined): boolean {
    const role = extractRole(arg);
    return role === AuthRole.Admin || role === AuthRole.User;
}

/** Returns true if the current user is admin. */
export function isAdmin(arg: AuthRole | WithAuthRole | null | undefined): boolean {
    const role = extractRole(arg);
    return role === AuthRole.Admin;
}
