import { Action, Middleware } from '@reduxjs/toolkit';

import { exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, resolve } from '@tauri-apps/api/path';

import {
    advanceStepper,
    setAutoTriggerState,
    resetPreferencesToDefault,
    setDataSourceConfigPath,
    setSqlDebug,
    setStepper
} from './preferencesSlice';
import {
    setDataSourcePaths,
    addDataSourcePath,
    removeDataSourcePath,
    setRootPath,
    setRegexPattern,
    resetDataSourceConfigToDefault,
} from './dataSourceConfigSlice';
import { addFolder, removeFolder, removeFolderById, resetFolders } from './dataSourceStateSlice';

import { isDataSourceFoldersValid } from '@/utils/validators';
import { prepPreferenceWriteOut } from '@/utils/helper';

import { setSqlDebugLogging } from '@/db';
import { RootState } from '@/store';
import { ConfigStepperState } from '@/types/stepper';

/**
 * Middleware to do validation & persistence whenever a state changes
 */
export const validationPersistenceMiddleware: Middleware = storeApi => next => action => {
    const result = next(action) as RootState;    // Let the reducer run first
    const state = storeApi.getState() as RootState;
    const {
        preferences,
        dataSourceConfig,
        dataSourceState,
    } = state;

    // Match only path-related reducers
    const prefTypes: string[] = [
        // Preference files config types
        setDataSourceConfigPath.type,
        setAutoTriggerState.type,
        setSqlDebug.type,
        resetPreferencesToDefault.typePrefix,
    ];
    const dataSourceTypes: string[] = [
        // Data source config types
        setRootPath.type,
        setRegexPattern.type,
        setDataSourcePaths.type,
        addDataSourcePath.type,
        removeDataSourcePath.type,
        resetDataSourceConfigToDefault.type,
    ];

    const acc: Action = action as Action;

    switch (acc.type) {
        case setSqlDebug.type: {
            // Apply SQL debug flag immediately to DB logger
            setSqlDebugLogging(preferences.sqlDebug);
            break;
        }
        // Validate stepper when paths or folders change
        case setDataSourcePaths.type:
        case addDataSourcePath.type:
        case removeDataSourcePath.type:
        case addFolder.type:
        case removeFolder.type:
        case removeFolderById.type:
        case resetFolders.type: {
            // checks that all folders are valid (non-error) and that there is at least one folder
            const ok = isDataSourceFoldersValid(dataSourceState);
            if (ok) storeApi.dispatch(advanceStepper(ConfigStepperState.Metadata));
            else storeApi.dispatch(setStepper(ConfigStepperState.Subdirectories));
            break;
        }
        case setRootPath.type: {
            // Root path is optional; keep user at Subdirectories step
            storeApi.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
            break;
        }
        case setDataSourceConfigPath.type: {
            exists(preferences.dataSourceConfigPath).then((ok) => {
                if (ok) storeApi.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
                else storeApi.dispatch(setStepper(ConfigStepperState.ConfigInfo));
            });
            break;
        }
        default:
            break;
    }

    let data: string | null = null;
    let path: string | null = null;
    if (prefTypes.includes(acc.type)) {
        data = prepPreferenceWriteOut(preferences);
        path = preferences.preferenceFilePath;
    }
    else if (dataSourceTypes.includes(acc.type)) {
        data = JSON.stringify(dataSourceConfig, null, 2);
        path = preferences.dataSourceConfigPath;
    } else return result;

    if (!data || !path) return result;
    persistHelper(data, path)
        .then(() => {
            // TODO:
        })
        .catch(() => {
            // TODO:
        });

    return result;
};

async function persistHelper(data: string, dir: string) {
    const appData = await appDataDir();
    const path = await resolve(appData, dir);
    try {
        await writeTextFile(path, data);
    } catch (err: unknown) {
        console.error(err);
    }
}
