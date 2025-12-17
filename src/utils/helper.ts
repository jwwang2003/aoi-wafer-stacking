import { appDataDir, resolve } from '@tauri-apps/api/path';
import { PreferencesState } from '@/types/preferences';
import { initialPreferencesState as initialState } from '@/constants/default';
import { PREFERENCES_FILENAME, DATA_SOURCE_CONFIG_FILENAME } from '@/constants';
import { norm } from './fs';

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
    const preferenceFilePath = norm(await resolve(dir, PREFERENCES_FILENAME));
    const dataSourceConfigPath = norm(await resolve(dir, DATA_SOURCE_CONFIG_FILENAME));

    return {
        ...initialState,
        preferenceFilePath,
        dataSourceConfigPath,
        dieLayoutXlsPath: initialState.dieLayoutXlsPath,
    };
}

export function prepPreferenceWriteOut(pref: PreferencesState): string {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, error, stepper, ...persistable } = pref;
    return JSON.stringify(persistable, null, 2)
}
