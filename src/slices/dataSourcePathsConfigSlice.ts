/**
 * The data source paths config slice only keeps track of the path strings
 * relative to the root folder. It does not track the state of the folder, such
 * as whether is exists or not. To track the status of a data source folder, we
 * refer to the data source state slice.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { baseDir, DATA_SOURCES_CONFIG_FILENAME } from '@/constants';
import { RootState } from '@/store';
import { DataSourceConfigState, DataSourceType } from '@/types/DataSource';
import { arraysAreEqual, getRelativePath, sortBySubfolderName } from '@/utils/fs';

import { initialDataSourcePathsConfigState as initialState, now } from '@/constants/default';
import { createDefaultDataSourceConfig, mergeDefinedKeys } from '@/utils/helper';
import { isDataSourcePathsValid, isDataSourceRootValid, isValidDataSourceConfig } from '@/utils/validators';
import { setStepper } from './preferencesSlice';
import { ConfigStepperState } from '@/types/Stepper';

export const initDataSourceConfig = createAsyncThunk<
    DataSourceConfigState,
    void,
    { state: RootState, rejectValue: string }
>(
    'dataSourcePathsConfig/init',
    async (_, thunkAPI) => {
        let config: DataSourceConfigState = { ...initialState };
        try {
            const { preferences } = thunkAPI.getState();
            const { dataSourceConfigPath } = preferences;
            config = await createDefaultDataSourceConfig();

            let parsed: unknown = null;
            try {
                const raw = await readTextFile(
                    dataSourceConfigPath || DATA_SOURCES_CONFIG_FILENAME, { baseDir }
                );
                parsed = JSON.parse(raw);
            } catch (err: unknown) {
                console.debug('[DATA SOURCE CONF. file check] assuming file DNE', err);
                console.debug('Creating data source config file...');
                const data = JSON.stringify(config);
                await writeTextFile(
                    dataSourceConfigPath || DATA_SOURCES_CONFIG_FILENAME, data, { baseDir }
                );
                const result = await readTextFile(
                    dataSourceConfigPath || DATA_SOURCES_CONFIG_FILENAME, { baseDir }
                );
                parsed = JSON.parse(result);
            }

            if (isValidDataSourceConfig(parsed)) {
                config = mergeDefinedKeys(config, parsed);
            } else {
                console.warn('[DATA SOURCE CONF. validation] invalid config structure, using defaults');
            }

            await thunkAPI.dispatch(setStepper(ConfigStepperState.RootDirectory));

            // check if the root path is defined and valid
            if (config.rootPath && await isDataSourceRootValid(config)) {
                const { preferences } = thunkAPI.getState();
                const { stepper } = preferences;
                // advance stepper
                if (stepper <= ConfigStepperState.RootDirectory) {
                    await thunkAPI.dispatch(setStepper(ConfigStepperState.RootDirectory + 1));
                }
            }

            if (config.paths && isDataSourcePathsValid(config.paths)) {
                const { preferences } = thunkAPI.getState();
                const { stepper } = preferences;
                // advance stepper
                if (stepper <= ConfigStepperState.Subdirectories) {
                    await thunkAPI.dispatch(setStepper(ConfigStepperState.Subdirectories + 1));
                }
            }

            return config;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

// export const revalidateDataSourcePaths = createAsyncThunk<
//     {},
//     void,
//     { state: RootState, rejectValue: string}
// >('dataSourcePathsConfig/revalidate', async (_, thunkAPI) => {

// });

const dataSourcePathsSlice = createSlice({
    name: 'dataSourcePathsConfig',
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

        // —— Regex reducer ——
        setRegexPattern(state, action: PayloadAction<{ type: DataSourceType; regex: string }>) {
            const { type, regex } = action.payload;
            if (state.regex[type] !== regex) {
                state.regex[type] = regex;
                state.regex.lastModified = now();
            }
        },

        // —— Save action ——
        saveConfig(state) {
            state.lastSaved = now();
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(initDataSourceConfig.fulfilled, (_, action) => {
                return action.payload;
            })
            .addCase(initDataSourceConfig.rejected, () => {
                return;
            });
    }
});

export const {
    setRootPath,
    setDataSourcePaths,
    addDataSourcePath,
    removeDataSourcePath,
    setRegexPattern,
    saveConfig,
} = dataSourcePathsSlice.actions;

export default dataSourcePathsSlice.reducer;