import { DB_FILENAME } from '@/constants';
import Database from '@tauri-apps/plugin-sql';

let _db: Database | null = null;

// Chunking limits (SQLite host params)
export const MAX_PARAMS = 999;

/**
 * The method checks if a database is initialized, if not it will initialize one,
 * and then it returns the database. The database is located in the app data folder.
 * @returns current Database
 */
export async function getDb(): Promise<Database> {
    if (_db) return _db;
    _db = await Database.load(`sqlite:${DB_FILENAME}`);
    // Must be enabled per-connection in SQLite
    await _db.execute('PRAGMA foreign_keys = ON;');
    return _db;
}

import * as fileIndex from './fileIndex';
import * as folderIndex from './folderIndex';
import * as dbTypes from './types';

export {
    fileIndex,
    folderIndex,
    dbTypes
};