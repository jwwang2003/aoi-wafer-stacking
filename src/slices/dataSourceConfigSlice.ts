/**
 * Data source config slice keeps track of ABSOLUTE folder paths per type.
 * It does not track folder existence or metadata; that lives in dataSourceState.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { readTextFile } from '@tauri-apps/plugin-fs';

// UI
import { toast } from 'react-toastify';

// TYPES
import { DataSourceConfigState, DataSourceType } from '@/types/dataSource';
import { ConfigStepperState } from '@/types/stepper';

// STATE
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';
import { addFolder } from './dataSourceStateSlice';

// UTILS
import { arraysAreEqual, getSubfolders, sortBySubfolderName, norm } from '@/utils/fs';
import { autoRecognizeFoldersByType } from '@/utils/dataSource';
import { isDataSourcePathsValid, isValidDataSourceConfig } from '@/utils/validators';
import { mergeDefinedKeys } from '@/utils/helper';

import { baseDir, DATA_SOURCE_CONFIG_FILENAME } from '@/constants';
import { initialDataSourceConfigState, initialDataSourceConfigState as initialState } from '@/constants/default';
import { dirScanResultToast } from '@/components/Toaster';
import { init_data_source_config } from '@/utils/init';


export const initDataSourceConfig = createAsyncThunk<
    DataSourceConfigState,
    void,
    { state: RootState, rejectValue: string }
>(
    'dataSourceConfig/init',
    async (_, thunkAPI) => {
        const name = 'DATA SOURCE CONF. file check';
        let config: DataSourceConfigState = { ...initialState };
        try {
            const { preferences } = thunkAPI.getState();
            const { dataSourceConfigPath } = preferences;

            const path = dataSourceConfigPath || DATA_SOURCE_CONFIG_FILENAME;  // with fallback

            let parsed: unknown = null;
            try {
                const raw = await readTextFile(
                    path, { baseDir }
                );
                parsed = JSON.parse(raw);
            } catch (err: unknown) {
                console.debug(`%c[${name}] assuming file DNE`, 'color:#6b7280', err);
                console.info('%cCreating data source config file...', 'color:#2563eb');
                if (!await init_data_source_config()) {
                    console.error(`[${name}] failed!`);
                    return config;
                }
                const result = await readTextFile(path, { baseDir });
                parsed = JSON.parse(result);
            }

            if (isValidDataSourceConfig(parsed)) {
                config = mergeDefinedKeys(config, parsed);
            } else {
                console.warn('%c[DATA SOURCE CONF. validation] invalid config structure, using defaults', 'color:#b45309');
            }

            // No separate root directory step; proceed to subdirectories stage
            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));

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
            raw = dataSourceConfigPath ?  await readTextFile(dataSourceConfigPath) : await readTextFile(DATA_SOURCE_CONFIG_FILENAME, { baseDir });
        } catch (err: unknown) {
            const error = 'Failed to read data source config file: ' + (err as string);
            thunkAPI.dispatch(setStepper(ConfigStepperState.ConfigInfo));
            throw Error(error);
        }

        const parsed = JSON.parse(raw);

        if (!isValidDataSourceConfig(parsed))
            return { valid: false, dataSourceConfig: defaultConfig };

        const merged = mergeDefinedKeys(defaultConfig, parsed);
        
        if (!isValidDataSourceConfig(merged))
            return { valid: false, dataSourceConfig: defaultConfig };

        const config = dataSourceConfig;

            // No separate root directory step; proceed to subdirectories stage
            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));

        if (config.paths && isDataSourcePathsValid(config.paths)) {
            await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Metadata));
        } else {
            await thunkAPI.dispatch(setStepper(ConfigStepperState.Subdirectories));
        }

        return { valid: true, dataSourceConfig: config };
    } catch (err: unknown) {
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

                    if (!inConfig) await dispatch(addDataSourcePath({ type, path }));
                    if (!inState) await dispatch(addFolder({ type, path }));

                    if (!inConfig && !inState) totAdded++;
                }
            }

            const duration = performance.now() - start;

            await dispatch(revalidateDataSource());

            dirScanResultToast(
                { totDirs: totFolders, numRead, numCached, totMatch, totAdded },
                duration,
                '子目录识别'
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
        },
        /** Reset entire dataSourceConfig to default initial state. */
        resetDataSourceConfigToDefault() {
            return { ...initialState };
        },

        // —— Data source paths reducers ——
        // All paths stored here are ABSOLUTE paths in the system
        setDataSourcePaths(state, action: PayloadAction<{ type: DataSourceType, paths: string[] }>) {
            const { type, paths } = action.payload;
            const normalized = paths.map(p => norm(p));
            const sortedPaths = sortBySubfolderName(normalized);
            if (!arraysAreEqual(state.paths[type], sortedPaths)) state.paths[type] = sortedPaths;
        },
        addDataSourcePath(state, action: PayloadAction<{ type: DataSourceType, path: string }>) {
            const { type, path } = action.payload;
            const absPath = norm(path);
            if (!state.paths[type].includes(absPath)) {
                state.paths[type].push(absPath);
                state.paths[type] = sortBySubfolderName(state.paths[type]);
            }
        },
        removeDataSourcePath(state, action: PayloadAction<{ type: DataSourceType, path: string }>) {
            const { type, path } = action.payload;
            const absPath = norm(path);
            state.paths[type] = state.paths[type].filter(p => p !== absPath);
        },
        removeAllDataSourcePaths(state) {
            for (const type of Object.values(['substrate', 'fabCp', 'cpProber', 'wlbi', 'aoi'] as DataSourceType[])) {
                state.paths[type] = [];
            }
        },

        // —— Regex reducer ——
        setRegexPattern(state, action: PayloadAction<{ type: DataSourceType; regex: string }>) {
            const { type, regex } = action.payload;
            if (state.regex[type] !== regex) {
                state.regex[type] = regex;
            }
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
    resetDataSourceConfigToDefault,
    setDataSourcePaths,
    addDataSourcePath,
    removeDataSourcePath,
    removeAllDataSourcePaths,
    setRegexPattern,
} = dataSourceSlice.actions;

export default dataSourceSlice.reducer;
