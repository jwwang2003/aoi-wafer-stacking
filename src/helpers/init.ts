import {
    PREFERENCES_FILENAME,
    DATA_SOURCES_CONFIG_FILENAME
} from "@/CONST";
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, BaseDirectory } from '@tauri-apps/api/path';

export async function init_fs() {
    // User preferences & other persistance stored here
    const appLocalDataBaseDir = await appLocalDataDir();

    const preferencesFilename = PREFERENCES_FILENAME;
    const dataSourcesConfigFilename = DATA_SOURCES_CONFIG_FILENAME;

    // Check if base directory exists, if not, create one
    try {
        if (!await exists('', { baseDir: BaseDirectory.AppLocalData })) {
            await mkdir('', { baseDir: BaseDirectory.AppLocalData });
        }
    } catch(e) {
        return false;
    }
    

    // Check if config file(s) exist
    try {
        if (!await exists(preferencesFilename, { baseDir: BaseDirectory.AppLocalData})) {
            // If preferences file DNE, create a empty one for now
            await writeTextFile(
                preferencesFilename,
                JSON.stringify({}, null, 2),
                { baseDir: BaseDirectory.AppLocalData }
            )
        }
    } catch(e) {
        return false;
    }

    return true;
}
