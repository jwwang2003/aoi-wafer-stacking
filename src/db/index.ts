import { DB_FILENAME } from '@/constants';
import Database from '@tauri-apps/plugin-sql';

let _db: Database | null = null;

// Chunking limits (SQLite host params)
export const MAX_PARAMS = 999;

function compactSql(sql: string) {
    return sql.replace(/\s+/g, ' ').trim();
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, base = 60): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
        try { return await fn(); }
        catch (e: any) {
            const msg = String(e?.message ?? e);
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

function instrumentDbLogging(db: Database) {
    if ((db as any).__sqlLoggerInstalled) return;

    const origExecute = db.execute.bind(db);
    const origSelect = db.select.bind(db);

    db.execute = (async (sql: string, params?: unknown[]) => {
        const start = performance.now();
        try {
            const res = await origExecute(sql, params);
            const ms = (performance.now() - start).toFixed(1);
            const rowsAffected = (res as any)?.rowsAffected;
            console.groupCollapsed(
                `%cSQL %cEXEC%c ${ms}ms`,
                'color:#667', 'color:#06f;font-weight:600', 'color:#999'
            );
            console.log(compactSql(sql));
            if (params?.length) console.log('params:', params);
            if (rowsAffected !== undefined) console.log('rowsAffected:', rowsAffected);
            console.groupEnd();
            return res;
        } catch (err) {
            const ms = (performance.now() - start).toFixed(1);
            console.groupCollapsed(
                `%cSQL %cEXEC ERROR%c ${ms}ms`,
                'color:#667', 'color:#c00;font-weight:700', 'color:#999'
            );
            console.log(compactSql(sql));
            if (params?.length) console.log('params:', params);
            console.error(err);
            console.groupEnd();
            throw err;
        }
    }) as typeof db.execute;

    db.select = (async <T = unknown>(sql: string, params?: unknown[]) => {
        const start = performance.now();
        try {
            const rows = await origSelect<T>(sql, params);
            const ms = (performance.now() - start).toFixed(1);
            const count =
                Array.isArray(rows) ? rows.length : (rows as any)?.length ?? 'unknown';
            console.groupCollapsed(
                `%cSQL %cSELECT%c ${ms}ms rows=${count}`,
                'color:#667', 'color:#0a0;font-weight:600', 'color:#999'
            );
            console.log(compactSql(sql));
            if (params?.length) console.log('params:', params);
            console.groupEnd();
            return rows;
        } catch (err) {
            const ms = (performance.now() - start).toFixed(1);
            console.groupCollapsed(
                `%cSQL %cSELECT ERROR%c ${ms}ms`,
                'color:#667', 'color:#c00;font-weight:700', 'color:#999'
            );
            console.log(compactSql(sql));
            if (params?.length) console.log('params:', params);
            console.error(err);
            console.groupEnd();
            throw err;
        }
    }) as typeof db.select;

    (db as any).__sqlLoggerInstalled = true;
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
    // await _db.execute('PRAGMA foreign_keys=ON'); // enable if you need FK enforcement

    // Install SQL logger once
    instrumentDbLogging(_db);

    return _db;
}

/** Internal: run VACUUM safely (must not be inside an open transaction). */
export async function vacuum(): Promise<void> {
    const db = await getDb();
    try { await db.execute('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { }
    await db.execute('VACUUM');
}

import * as fileIndex from './fileIndex';
import * as folderIndex from './folderIndex';
import * as dbTypes from './types';

export {
    fileIndex,
    folderIndex,
    dbTypes
};
