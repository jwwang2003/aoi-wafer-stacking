import { DB_FILENAME } from "@/constants";
import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

/**
 * The method checks if a database is initialized, if not it will initialize one,
 * and then it returns the database. The database is located in the app data folder.
 * @returns current Database
 */
export async function getDb(): Promise<Database> {
    if (_db) return _db;
    _db = await Database.load(`sqlite:${DB_FILENAME}`);
    return _db;
}

import * as fileIndex from "./fileIndex";
import * as folderIndex from "./folderIndex";

export {
    fileIndex,
    folderIndex
};