import { DataSourceConfigState, DataSourcePaths, FolderGroupsState } from '@/types/dataSource';
import { PreferencesState } from '@/types/preferences';
import { exists } from '@tauri-apps/plugin-fs';

export function isValidPreferences(input: unknown): input is PreferencesState {
    if (!input || typeof input !== 'object') return false;

    const pref = input as Partial<PreferencesState>;

    return (
        typeof pref.preferenceFilePath === 'string' &&
        typeof pref.dataSourceConfigPath === 'string'
    );
}

export function isValidDataSourceConfig(input: unknown): input is DataSourceConfigState {
    if (!input || typeof input !== 'object') return false;

    const cfg = input as Partial<DataSourceConfigState>;

    return (
        typeof cfg.rootPath === 'string' &&
        typeof cfg.rootLastModified === 'string' &&
        typeof cfg.lastSaved === 'string' &&
        typeof cfg.paths === 'object' &&
        cfg.paths !== null &&
        typeof cfg.regex === 'object' &&
        cfg.regex !== null
    );
}

// Reuseable validators
export async function isDataSourceRootValid(state: DataSourceConfigState) {
    try {
        await exists(state.rootPath);
    } catch {
        return false;
    }
    return true;
}

export function isDataSourcePathsValid(paths: DataSourcePaths): boolean {
    for (const [key, value] of Object.entries(paths)) {
        if (key === 'lastModified') continue;
        if (value.length > 0) return true;
    }
    return false;
}

export function isDataSourceFoldersValid(paths: FolderGroupsState): boolean {
    let flag = false;
    for (const [, folders] of Object.entries(paths)) {
        for (const folder of folders) {
            flag = true;
            if (folder.error) return false;
        }
    }
    return flag;
}