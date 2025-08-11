/**
 * The data source paths config slice only keeps track of the path strings
 * relative to the root folder. It does not track the state of the folder, such
 * as whether is exists or not. To track the status of a data source folder, we
 * refer to the data source state slice.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// UI
import { toast } from 'react-toastify';

// TYPES
import { DataSourceConfigState, DataSourceType } from '@/types/DataSource';
import { ConfigStepperState } from '@/types/Stepper';

// STATE
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';
import { addFolder } from './dataSourceStateSlice';

// UTILS
import { arraysAreEqual, getRelativePath, getSubfolders, sortBySubfolderName } from '@/utils/fs';
import { autoRecognizeFoldersByType } from '@/utils/dataSource';
import { isDataSourcePathsValid, isDataSourceRootValid, isValidDataSourceConfig } from '@/utils/validators';
import { createDefaultDataSourceConfig, mergeDefinedKeys } from '@/utils/helper';

import { baseDir, DATA_SOURCES_CONFIG_FILENAME } from '@/constants';
import { initialDataSourceConfigState, initialDataSourceConfigState as initialState, now } from '@/constants/default';
import { dirScanResultToast } from '@/components/Toaster';


export const initDataSourceConfig = createAsyncThunk<
    DataSourceConfigState,
    void,
    { state: RootState, rejectValue: string }
>(
    'dataSourceConfig/init',
    async (_, thunkAPI) => {
        let config: DataSourceConfigState = { ...initialState };
        try {
            const { preferences } = thunkAPI.getState();
            const { dataSourceConfigPath } = preferences;

            config = await createDefaultDataSourceConfig();

            const path = dataSourceConfigPath || DATA_SOURCES_CONFIG_FILENAME;  // with fallback

            let parsed: unknown = null;
            try {
                const raw = await readTextFile(
                    path, { baseDir }
                );
                parsed = JSON.parse(raw);
            } catch (err: unknown) {
                console.debug('[DATA SOURCE CONF. file check] assuming file DNE', err);
                console.debug('Creating data source config file...');
                const data = JSON.stringify(config);
                await writeTextFile(
                    path, data, { baseDir }
                );
                const result = await readTextFile(
                    path, { baseDir }
                );
                parsed = JSON.parse(result);
            }

            if (isValidDataSourceConfig(parsed)) {
                config = mergeDefinedKeys(config, parsed);
            } else {
                console.warn('[DATA SOURCE CONF. validation] invalid config structure, using defaults');
            }

            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.RootDirectory));

            if (config.rootPath && await isDataSourceRootValid(config)) {
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
                await thunkAPI.dispatch(scanDataSourceFolders());
            } else {
                await thunkAPI.dispatch(setStepper(ConfigStepperState.RootDirectory));
                return config;
            }

            if (config.paths && isDataSourcePathsValid(config.paths)) {
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Metadata));
            } else {
                await thunkAPI.dispatch(setStepper(ConfigStepperState.Subdirectories));
            }

            return config;
        } catch (err: unknown) {
            if (err instanceof Error) {
                return thunkAPI.rejectWithValue(err.message);
            } else if (typeof err === 'string') {
                return thunkAPI.rejectWithValue(err);
            }
            return thunkAPI.rejectWithValue('Unknown error');
        }
    }
);

export const revalidateDataSource = createAsyncThunk<
    { dataSourceConfig: DataSourceConfigState; valid: boolean },
    void,
    { state: RootState, rejectValue: string }
>('dataSourceConfig/revalidate', async (_, thunkAPI) => {
    try {
        const { preferences, dataSourceConfig } = thunkAPI.getState();
        const { dataSourceConfigPath } = preferences;
        const defaultConfig = { ...initialDataSourceConfigState };

        let raw = null;
        try {
            if (dataSourceConfigPath) {
                raw = await readTextFile(dataSourceConfigPath);
            } else {
                raw = await readTextFile(DATA_SOURCES_CONFIG_FILENAME, { baseDir });
            }
        } catch (err: unknown) {
            const error = 'Failed to read data source config file: ' + (err as string);
            thunkAPI.dispatch(setStepper(ConfigStepperState.ConfigInfo));
            throw Error(error);
        }

        const parsed = JSON.parse(raw);

        if (!isValidDataSourceConfig(parsed)) {
            return {
                valid: false,
                dataSourceConfig: defaultConfig,
            };
        }

        const merged = mergeDefinedKeys(defaultConfig, parsed);
        if (!isValidDataSourceConfig(merged)) {
            return {
                valid: false,
                dataSourceConfig: defaultConfig,
            };
        }

        const parsedLastSaved = merged.lastSaved ?? 0;
        const localLastSaved = dataSourceConfig.lastSaved ?? 0;

        // Compare timestamps and decide which config to use
        const useLocal = localLastSaved >= parsedLastSaved;

        const config = useLocal ? dataSourceConfig : merged;

        await thunkAPI.dispatch(advanceStepper(ConfigStepperState.RootDirectory));

        if (config.rootPath && await isDataSourceRootValid(config)) {
            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
        } else {
            await thunkAPI.dispatch(setStepper(ConfigStepperState.RootDirectory));
            return { valid: true, dataSourceConfig: config };
        }

        if (config.paths && isDataSourcePathsValid(config.paths)) {
            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Metadata));
        } else {
            await thunkAPI.dispatch(setStepper(ConfigStepperState.Subdirectories));
        }

        return {
            valid: true,
            dataSourceConfig: config,
        };
    } catch (err: unknown) {
        // const fallback = await createDefaultPreferences();
        if (err instanceof Error)
            return thunkAPI.rejectWithValue(err.message);
        else if (typeof err === 'string')
            return thunkAPI.rejectWithValue(err);
        return thunkAPI.rejectWithValue('Unknown error');
    }
});

export const scanDataSourceFolders = createAsyncThunk<
    { totMatch: number; totAdded: number },
    void,
    {
        state: RootState;
        rejectValue: string;
    }
>(
    'dataSource/scanDataSourceFolders',
    async (_, { dispatch, getState, rejectWithValue }) => {
        const {
            dataSourceConfig: { rootPath, regex, paths: configPaths },
            dataSourceState,
        } = getState();
        if (!rootPath) return { totMatch: 0, totAdded: 0 };

        try {
            const start = performance.now();

            if (!rootPath || rootPath === '') throw Error('请先设置根目录！');
            const { folders: subfolders, totDir: totFolders, numRead, numCached } = await getSubfolders(rootPath, false);
            if (totFolders === 0) throw new Error('未识别到任何符合的子文件夹。请检查正则表达式和文件夹结构。');
            const folders = await autoRecognizeFoldersByType(subfolders, regex);

            let totMatch = 0;
            let totAdded = 0;

            for (const [typeKey, paths] of Object.entries(folders)) {
                const type = typeKey as DataSourceType;
                const existingInConfig = new Set(configPaths[type]);
                const existingInState = new Set(
                    dataSourceState[type].map((f) => f.path)
                );

                for (const path of paths) {
                    totMatch++;
                    const inConfig = existingInConfig.has(path);
                    const inState = existingInState.has(path);

                    if (!inConfig) dispatch(addDataSourcePath({ type, path }));
                    if (!inState) dispatch(addFolder({ type, path }));

                    if (!inConfig && !inState) totAdded++;
                }
            }

            const duration = performance.now() - start;

            await dispatch(revalidateDataSource());

            dirScanResultToast(
                { totDirs: totFolders, numRead, numCached, totMatch, totAdded },
                duration,
                "子目录识别"
            );

            return { totMatch, totAdded };
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : '自动识别过程中发生未知错误。';

            // show error toast here
            toast.error(`自动识别失败：${message}`, {
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
            });

            return rejectWithValue(message);
        }
    }
);

const dataSourceSlice = createSlice({
    name: 'dataSourceConfig',
    initialState,
    reducers: {
        // —— Root path reducer ——
        setRootPath(state, action: PayloadAction<string>) {
            state.rootPath = action.payload;
            state.rootLastModified = now();
        },

        // —— Data source paths reducers ——
        // WARN: all paths stored here should be relative to the root folder path
        setDataSourcePaths(state, action: PayloadAction<{ type: DataSourceType, paths: string[] }>) {
            const { type, paths } = action.payload;
            const relativePaths = paths.map(p => getRelativePath(state.rootPath, p));
            const sortedPaths = sortBySubfolderName(relativePaths);
            if (!arraysAreEqual(state.paths[type], paths)) {
                state.paths[type] = sortedPaths;
                state.paths.lastModified = now();
            }
        },
        addDataSourcePath(state, action: PayloadAction<{ type: DataSourceType, path: string }>) {
            const { type, path } = action.payload;
            const relativePath = getRelativePath(state.rootPath, path);
            if (!state.paths[type].includes(relativePath)) {
                state.paths[type].push(relativePath);
                state.paths[type] = sortBySubfolderName(state.paths[type]);
                state.paths.lastModified = now();
            }
        },
        removeDataSourcePath(state, action: PayloadAction<{ type: DataSourceType, path: string }>) {
            const { type, path } = action.payload;
            const relativePath = getRelativePath(state.rootPath, path);
            state.paths[type] = state.paths[type].filter(p => p != relativePath);
            state.paths.lastModified = now();
        },
        removeAllDataSourcePaths(state) {
            for (const type of Object.values(['substrate', 'fabCp', 'cpProber', 'wlbi', 'aoi'] as DataSourceType[])) {
                state.paths[type] = [];
            }
            state.paths.lastModified = now();
        },

        // —— Regex reducer ——
        setRegexPattern(state, action: PayloadAction<{ type: DataSourceType; regex: string }>) {
            const { type, regex } = action.payload;
            if (state.regex[type] !== regex) {
                state.regex[type] = regex;
                state.regex.lastModified = now();
            }
        },

        // —— Save action ——
        triggerSave() { },   // do nothing lol
        updateSavedTime(state) {
            state.lastSaved = now();
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(initDataSourceConfig.fulfilled, (_, action) => {
                return action.payload;
            })
            .addCase(initDataSourceConfig.rejected, () => {
                return;
            })

            .addCase(revalidateDataSource.fulfilled, (_, action) => {
                if (!action.payload.valid) {
                    console.error('Something went really wrong... dataSourceConfig was not valid!');
                }
                return action.payload.dataSourceConfig;
            })
            .addCase(revalidateDataSource.rejected, (_, action) => {
                console.error(action.payload ?? 'Unknown error');
            })
    }
});

export const {
    setRootPath,
    setDataSourcePaths,
    addDataSourcePath,
    removeDataSourcePath,
    removeAllDataSourcePaths,
    setRegexPattern,
    triggerSave,
    updateSavedTime,
} = dataSourceSlice.actions;

export default dataSourceSlice.reducer;