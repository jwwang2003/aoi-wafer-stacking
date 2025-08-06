import { appDataDir, resolve } from '@tauri-apps/api/path';
import { PreferencesState } from '@/types/Preferences';
import { initialPreferencesState as initialState } from '@/constants/default';
import { PREFERENCES_FILENAME, DATA_SOURCES_CONFIG_FILENAME } from '@/constants';

export function mergeDefinedKeys<T extends object>(
    base: T,
    override: Partial<Record<keyof T, unknown>>
): T {
    const result = { ...base };
    for (const key in base) {
        if (
            Object.prototype.hasOwnProperty.call(override, key) &&
            override[key] !== undefined &&
            override[key] !== null
        ) {
            result[key] = override[key] as T[typeof key];
        }
    }
    return result;
}

export async function createDefaultPreferences(): Promise<PreferencesState> {
    const dir = await appDataDir();
    const preferenceFilePath = await resolve(dir, PREFERENCES_FILENAME);
    const dataSourceConfigPath = await resolve(dir, DATA_SOURCES_CONFIG_FILENAME);

    return {
        ...initialState,
        preferenceFilePath,
        dataSourceConfigPath,
    };
}

export function prepPreferenceWriteOut(pref: PreferencesState): string {
    const { preferenceFilePath, dataSourceConfigPath, offsets } = pref;
    return JSON.stringify(
        {
            preferenceFilePath,
            dataSourceConfigPath,
            offsets
        },
        null,
        2
    )
}

import { DataSourceConfigState } from '@/types/DataSource';
import { initialDataSourceConfigState } from '@/constants/default';

export async function createDefaultDataSourceConfig(): Promise<DataSourceConfigState> {
    // const dir = await appDataDir();
    // const configFilePath = await resolve(dir, DATA_SOURCES_CONFIG_FILENAME);

    return {
        ...initialDataSourceConfigState,
    };
}