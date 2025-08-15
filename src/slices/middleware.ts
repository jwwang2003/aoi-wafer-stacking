import { Action, Middleware } from '@reduxjs/toolkit';
import {
    setDataSourcePaths,
    addDataSourcePath,
    removeDataSourcePath,
    setRootPath,
    setRegexPattern,
    triggerSave,
    updateSavedTime,
} from '@/slices/dataSourceConfigSlice';
import { advanceStepper, resetPreferencesToDefault, setDataSourceConfigPath, setStepper } from './preferencesSlice';
import { exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, resolve } from '@tauri-apps/api/path';
import { isDataSourceFoldersValid, isDataSourceRootValid } from '@/utils/validators';
import { addFolder, removeFolder, removeFolderById, resetFolders } from './dataSourceStateSlice';
import { ConfigStepperState } from '@/types/stepper';
import { RootState } from '@/store';
import { prepPreferenceWriteOut } from '@/utils/helper';

/**
 * Middleware to do validation & persistence whenever a state changes
 */
export const validationPersistenceMiddleware: Middleware = storeApi => next => action => {
    const result = next(action) as RootState;    // Let the reducer run first
    const state = storeApi.getState();
    const {
        preferences,
        dataSourceConfig,
        dataSourceState,
    } = state;

    // Match only path-related reducers
    const prefTypes: string[] = [
        // Preference files config types
        dataSourceConfig.type,
        resetPreferencesToDefault.typePrefix,
    ];
    const dataSourceTypes: string[] = [
        // Data source config types
        setRootPath.type,
        setRegexPattern.type,
        setDataSourcePaths.type,
        addDataSourcePath.type,
        removeDataSourcePath.type,
        triggerSave.type
    ];
    // const dataSourceStateTypes: string[] = [
    //     addFolder.type,
    //     removeFolder.type,
    //     removeFolderById.type,
    //     resetFolders.type,
    // ];

    const acc: Action = action as Action;
    switch (acc.type) {
        case addFolder.type, removeFolder.type, removeFolderById.type, resetFolders.type: {
            // checks that all folders are valid (non-error) and that there is at least one folder
            const result = isDataSourceFoldersValid(dataSourceState);
            if (result) {
                storeApi.dispatch(advanceStepper(ConfigStepperState.Metadata));
            } else {
                storeApi.dispatch(setStepper(ConfigStepperState.Subdirectories));
            }
            break;
        }
        case setRootPath.type: {
            isDataSourceRootValid(dataSourceConfig)
                .then((result) => {
                    if (result) {
                        storeApi.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
                    } else {
                        storeApi.dispatch(setStepper(ConfigStepperState.RootDirectory));
                    }
                });
            break;
        }
        case setDataSourceConfigPath.type: {
            exists(preferences.dataSourceConfigPath)
                .then((result) => {
                    if (result) {
                        storeApi.dispatch(advanceStepper(ConfigStepperState.RootDirectory));
                    } else {
                        storeApi.dispatch(setStepper(ConfigStepperState.ConfigInfo));
                    }
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
        storeApi.dispatch(updateSavedTime());
    } else {
        return result;
    }

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