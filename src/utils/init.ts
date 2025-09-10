import {
    PREFERENCES_FILENAME,
    DATA_SOURCE_CONFIG_FILENAME,
} from '@/constants';
import { exists, ExistsOptions, mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, localDataDir, BaseDirectory, resolve } from '@tauri-apps/api/path';
import { initialDataSourceState } from '@/constants/default';
import { getDb } from '@/db';
import { maybeApplyEnvAdminDefault } from '@/db/auth';
import { createDefaultPreferences } from './helper';

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
        // Step. 1
        // Ensure AppData folder exists
        await get_folder('', { baseDir: appDataBaseDir });
        console.log('AppData directory initialized at:', await appDataDir());
        // Ensure LocalData folder exists
        await get_folder('', { baseDir: localDataBaseDir });
        console.log('LocalData directory initialized at:', await localDataDir());

        // Step. 2 -- Init. all config files if not present
        await init_pref();
        await init_data_source_config();
        // Step. 3 -- Connect to SQLite
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
    const fullPath = await resolve(appDataDirPath, PREFERENCES_FILENAME);

    try {
        const fileExists = await exists(PREFERENCES_FILENAME, { baseDir: BaseDirectory.AppData });
        if (!fileExists) {
            await writeTextFile(
                PREFERENCES_FILENAME,
                JSON.stringify(
                    await createDefaultPreferences(),        // the default preferences state
                    null, 
                    2
                ),
                { baseDir: BaseDirectory.AppData }
            );
        }
        return true;
    } catch (err) {
        console.error(`Failed to initialize preferences file in ${fullPath}:`, err);
        return false;
    }
}

/**
 * Checks and loads the data_sources.json file.
 * If the file does not exist, it creates an empty JSON file.
 * Locks the file at the start and unlocks at the end.
 * Base: BaseDirectory.AppData, appDataDir()
 */
export async function init_data_source_config(): Promise<boolean> {
    // Resolve full file path
    // const appDataDirPath = await appDataDir();
    // const fullPath = await resolve(appDataDirPath, DATA_SOURCES_CONFIG_FILENAME);

    try {
        const fileExists = await exists(DATA_SOURCE_CONFIG_FILENAME, { baseDir: BaseDirectory.AppData });
        if (!fileExists) {
            await writeTextFile(
                DATA_SOURCE_CONFIG_FILENAME,
                JSON.stringify(
                    initialDataSourceState,         // the default data source config state
                    null, 
                    2
                ),
                { baseDir: BaseDirectory.AppData }
            );
        }
        return true;
    } catch (err) {
        console.error('Failed to initialize data sources file:', err);
        return false;
    }
}


/**
 * Initializes the SQLite database inside the AppData folder.
 */
export async function init_db(): Promise<void> {
    try {
        const db = await getDb();
        console.log('%cInitialized database!', 'color: orange', db.path);
        // Ensure the default admin password reflects env configuration if still at seed value.
        try {
            const changed = await maybeApplyEnvAdminDefault();
            if (changed) {
                console.log('%cAdmin default password set from env.', 'color: orange');
            }
        } catch (e) {
            console.warn('Failed to apply env admin default password:', e);
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
