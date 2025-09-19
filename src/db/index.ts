import { DB_FILENAME } from '@/constants';
import Database from '@tauri-apps/plugin-sql';

let _db: Database | null = null;

// Chunking limits (SQLite host params)
export const MAX_PARAMS = 999;

// Controls whether pretty SQL logs are echoed
let SQL_DEBUG = true;
export function setSqlDebugLogging(enabled: boolean) {
    SQL_DEBUG = enabled;
}

function compactSql(sql: string) {
    return sql.replace(/\s+/g, ' ').trim();
}

function fmtParams(params?: unknown[]) {
    if (!params || params.length === 0) return '';
    try { return JSON.stringify(params); } catch { return String(params); }
}

function logSqlPretty(
    kind: 'EXEC' | 'SELECT',
    ms: string,
    sql: string,
    opts?: { rows?: number | string; rowsAffected?: number; params?: unknown[] }
) {
    if (!SQL_DEBUG) return;
    const header = [
        `SQL ${kind}`,
        `${ms}ms`,
        opts?.rows != null ? `rows=${opts.rows}` : undefined,
        opts?.rowsAffected != null ? `rowsAffected=${opts.rowsAffected}` : undefined,
    ].filter(Boolean).join(' | ');

    const emoji = kind === 'EXEC' ? '🛠️' : '🔎';
    const lines = [
        `${emoji} ${header}`,
        `  ${compactSql(sql)}`,
    ];
    const p = fmtParams(opts?.params);
    if (p) lines.push(`  params: ${p}`);
    // Single pretty, multi-line log
    console.debug(lines.join('\n'));
}

function logSqlError(
    kind: 'EXEC' | 'SELECT',
    ms: string,
    sql: string,
    err: unknown,
    params?: unknown[]
) {
    const header = `SQL ${kind} ERROR | ${ms}ms`;
    const emoji = '❌';
    const lines = [
        `${emoji} ${header}`,
        `  ${compactSql(sql)}`,
    ];
    const p = fmtParams(params);
    if (p) lines.push(`  params: ${p}`);
    lines.push(`  error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(lines.join('\n'));
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, base = 60): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try { return await fn(); }
        catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('database is locked') || msg.includes('SQLITE_BUSY')) {
                await sleep(base * (2 ** i) + Math.floor(Math.random() * base));
                lastErr = e;
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

type DbWithLoggerFlag = Database & { __sqlLoggerInstalled?: boolean };
function instrumentDbLogging(db: Database) {
    const dbx = db as DbWithLoggerFlag;
    if (dbx.__sqlLoggerInstalled) return;

    const origExecute = db.execute.bind(db);
    const origSelect = db.select.bind(db);

    db.execute = (async (sql: string, params?: unknown[]) => {
        const start = performance.now();
        try {
            const res = await origExecute(sql, params);
            const ms = (performance.now() - start).toFixed(1);
            const rowsAffected = (res && typeof res === 'object' && 'rowsAffected' in (res as object)
                ? (res as { rowsAffected?: number }).rowsAffected
                : undefined);
            logSqlPretty('EXEC', ms, sql, { params, rowsAffected });
            return res;
        } catch (err) {
            const ms = (performance.now() - start).toFixed(1);
            logSqlError('EXEC', ms, sql, err, params);
            throw err;
        }
    }) as typeof db.execute;

    db.select = (async <T = unknown>(sql: string, params?: unknown[]) => {
        const start = performance.now();
        try {
            const rows = await origSelect<T>(sql, params);
            const ms = (performance.now() - start).toFixed(1);
            const count = Array.isArray(rows)
                ? rows.length
                : (rows && typeof rows === 'object' && 'length' in (rows as object)
                    ? Number((rows as { length?: number }).length)
                    : 'unknown');
            logSqlPretty('SELECT', ms, sql, { params, rows: count });
            return rows;
        } catch (err) {
            const ms = (performance.now() - start).toFixed(1);
            logSqlError('SELECT', ms, sql, err, params);
            throw err;
        }
    }) as typeof db.select;

    dbx.__sqlLoggerInstalled = true;
}

/**
 * The method checks if a database is initialized, if not it will initialize one,
 * and then it returns the database. The database is located in the app data folder.
 * @returns current Database
 */
export async function getDb(): Promise<Database> {
    if (_db) return _db;
    _db = await Database.load(`sqlite:${DB_FILENAME}`);

    // Pragmas
    await _db.execute('PRAGMA journal_mode=WAL');
    await _db.execute('PRAGMA busy_timeout=5000');
    await _db.execute('PRAGMA foreign_keys=ON'); // enable if you need FK enforcement

    // Install SQL logger once
    instrumentDbLogging(_db);

    return _db;
}

/** Internal: run VACUUM safely (must not be inside an open transaction). */
export async function vacuum(): Promise<void> {
    const db = await getDb();
    try { await db.execute('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* noop */ }
    await db.execute('VACUUM');
}

/**
 * Utility: return a Set of existing values for a given table/column from the provided list.
 * Values are queried in chunks to respect SQLite parameter limits.
 */
export async function existingSet(
    table: string,
    column: string,
    values: string[],
    chunk = 300
): Promise<Set<string>> {
    const set = new Set<string>();
    if (!values?.length) return set;
    const db = await getDb();
    for (let i = 0; i < values.length; i += chunk) {
        const batch = values.slice(i, i + chunk);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await db.select<Array<{ v: string }>>(
            `SELECT ${column} AS v FROM ${table} WHERE ${column} IN (${placeholders})`,
            batch
        );
        for (const r of rows) set.add(r.v);
    }
    return set;
}

/** Light classifier for SQLite error messages into broad categories. */
export function classifySqliteError(e: unknown): 'FOREIGN_KEY' | 'UNIQUE' | 'NOT_NULL' | 'CHECK' | 'BUSY' | 'OTHER' {
    const msg = e instanceof Error ? e.message : String(e);
    if (/foreign key constraint failed/i.test(msg)) return 'FOREIGN_KEY';
    if (/SQLITE_BUSY|database is locked/i.test(msg)) return 'BUSY';
    if (/unique constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(msg)) return 'UNIQUE';
    if (/NOT NULL constraint failed/i.test(msg)) return 'NOT_NULL';
    if (/CHECK constraint failed/i.test(msg)) return 'CHECK';
    return 'OTHER';
}

import * as fileIndex from './fileIndex';
import * as folderIndex from './folderIndex';
import * as dbTypes from './types';

export {
    fileIndex,
    folderIndex,
    dbTypes
};
