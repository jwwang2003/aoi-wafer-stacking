import {
    baseDir,
    PREFERENCES_FILENAME,
    DATA_SOURCES_CONFIG_FILENAME,
    DB_FILENAME
} from '@/constants';
import { exists, ExistsOptions, mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, localDataDir, BaseDirectory, resolve } from '@tauri-apps/api/path';
import Database from '@tauri-apps/plugin-sql';

/**
 * Developer notes:
 * - The ROOT of the application"s data folder is based on BaseDirectory
 * - Preferences, config data, etc. will be stored in AppData (can roam)
 * - Other app-specific data will be stored in LocalData (not intended to roam)
 */

/**
 * Performs all the app initialization upon application startup
 */
export async function initialize() {
    const appDataBaseDir = BaseDirectory.AppData;
    const localDataBaseDir = BaseDirectory.LocalData;

    try {
        // Ensure AppData folder exists
        await get_folder('', { baseDir: appDataBaseDir });
        console.info('AppData directory initialized at:', await appDataDir());
        // Ensure LocalData folder exists
        await get_folder('', { baseDir: localDataBaseDir });
        console.info('LocalData directory initialized at:', await localDataDir());

        await init_pref();
        await init_data_source();
        await init_db();
    } catch (e) {
        console.error('Initialization error:', e);
        return false;
    }
}

/**
 * Checks and loads the preferences.json file.
 * If the file does not exist, it creates an empty JSON file.
 * Locks the file at the start and unlocks at the end.
 * Base: BaseDirectory.AppData, appDataDir()
 */
export async function init_pref(): Promise<boolean> {
    const appDataDirPath = await appDataDir();
    // Resolve full file path
    const fullPath = await resolve(appDataDirPath, PREFERENCES_FILENAME);

    try {
        const fileExists = await exists(PREFERENCES_FILENAME, { baseDir: BaseDirectory.AppData });
        if (!fileExists) {
            await writeTextFile(
                PREFERENCES_FILENAME,
                JSON.stringify({}, null, 2),
                { baseDir: BaseDirectory.AppData }
            );
        }
        // Lock the file using Tauri backend command
        // TODO: Implement locks?
        // await invoke("lock_file", { path: fullPath });
        return true;
    } catch (err) {
        console.error(`Failed to initialize preferences file in ${fullPath}:`, err);
        return false;
    } finally {
        // Always try to unlock even if an error occurs
        // try {
        //     const fullPath = await resolve(appDataDirPath, PREFERENCES_FILENAME);
        //     await invoke("unlock_file", { path: fullPath });
        // } catch (unlockErr) {
        //     console.warn("Failed to unlock preferences file:", unlockErr);
        // }
    }
}

/**
 * Checks and loads the data_sources.json file.
 * If the file does not exist, it creates an empty JSON file.
 * Locks the file at the start and unlocks at the end.
 * Base: BaseDirectory.AppData, appDataDir()
 */
export async function init_data_source(): Promise<boolean> {
    // Resolve full file path
    // const appDataDirPath = await appDataDir();
    // const fullPath = await resolve(appDataDirPath, DATA_SOURCES_CONFIG_FILENAME);

    try {
        const fileExists = await exists(DATA_SOURCES_CONFIG_FILENAME, { baseDir: BaseDirectory.AppData });
        if (!fileExists) {
            await writeTextFile(
                DATA_SOURCES_CONFIG_FILENAME,
                JSON.stringify({}, null, 2),
                { baseDir: BaseDirectory.AppData }
            );
        }
        // TODO: Implement locks?
        // await invoke("lock_file", { path: fullPath });
        return true;
    } catch (err) {
        console.error('Failed to initialize data sources file:', err);
        return false;
    } finally {
        // try {
        //     const fullPath = await resolve(appDataDirPath, DATA_SOURCES_CONFIG_FILENAME);
        //     await invoke("unlock_file", { path: fullPath });
        // } catch (unlockErr) {
        //     console.warn("Failed to unlock data sources file:", unlockErr);
        // }
    }
}


/**
 * Initializes the SQLite database inside the AppData folder.
 */
export async function init_db(): Promise<void> {
    try {
        const dir = await appDataDir();
        const dbPath = await resolve(dir, DB_FILENAME);

        const dbExists = await exists(DB_FILENAME, { baseDir });

        // Load the SQLite database from appDataDir
        const db = await Database.load(`sqlite:${dbPath}`);

        if (dbExists && db) {
            console.log('%cInitialized database!', 'color: orange', dbPath);
            await db.close();
        }
    } catch (err) {
        console.error('Database initialization failed:', err);
        throw err;
    }
}

export async function get_folder(
    path: string | URL,
    options?: ExistsOptions // includes baseDir
): Promise<string> {
    try {
        // Resolve full path (required for creating/checking)
        const fullPath = typeof path === 'string'
            ? await resolve(path.toString())
            : path.toString(); // In case URL is passed, assume it"s absolute

        const folderExists = await exists(path.toString(), options);

        if (!folderExists) {
            await mkdir(path.toString(), {
                ...options,
                recursive: true, // Ensure intermediate directories are created
            });
        }

        return fullPath;
    } catch (error) {
        throw new Error(`Failed to get or create folder "${path}": ${error}`);
    }
}