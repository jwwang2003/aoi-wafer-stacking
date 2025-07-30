/**
 * The data source paths config slice only keeps track of the path strings
 * relative to the root folder. It does not track the state of the folder, such
 * as whether is exists or not. To track the status of a data source folde , we
 * refer to the data source state slice.
 */

import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { appDataDir, BaseDirectory, resolve } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { DATA_SOURCES_CONFIG_FILENAME } from '@/constants';
import { RootState } from '@/store';
import { DataSourceConfigState, DataSourceType } from '@/types/DataSource';
import { arraysAreEqual, getRelativePath, sortBySubfolderName } from '@/utils/fs';

import { initialDataSourcePathsConfigState as initialState, now } from '@/constants/default';

export const initDataSourceConfig = createAsyncThunk<
    DataSourceConfigState,
    { dataSourcesConfigPath: string },
    { rejectValue: string }
>(
    'dataSourcePathsConfig/init',
    async ({ dataSourcesConfigPath }, thunkAPI) => {
        try {
            const appDataDirPath = await appDataDir();
            const path = await resolve(appDataDirPath, dataSourcesConfigPath || DATA_SOURCES_CONFIG_FILENAME);

            let config: DataSourceConfigState = initialState;

            try {
                const content = await readTextFile(path, {
                    baseDir: BaseDirectory.AppData,
                });
                config = JSON.parse(content);
            } catch {
                // First-time launch, no file exists
            }

            // Always write (normalize structure or create file)
            await writeTextFile(path, JSON.stringify(config, null, 2));

            return config;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

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
        setDataSoucePaths(state, action: PayloadAction<{ type: DataSourceType, paths: string[]}>) {
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
        removeDataSourcePath(state, action: PayloadAction<{ type: DataSourceType, path: string}>) {
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
            .addCase(initDataSourceConfig.fulfilled, (_state, action) => {
                return action.payload;
            });
    }
});

export const {
    setRootPath,
    setDataSoucePaths,
    addDataSourcePath,
    removeDataSourcePath,
    setRegexPattern,
    saveConfig,
} = dataSourcePathsSlice.actions;

export default dataSourcePathsSlice.reducer;

export const saveConfigToDisk = createAsyncThunk<
    void,
    void,
    { state: RootState }
>(
    'dataSourcePathsConfig/saveToDisk',
    async (_, thunkAPI) => {
        const state = thunkAPI.getState();
        const config = state.dataSourcePathsConfig;
        const preferences = state.preferences;

        await persistConfig(config, preferences.dataSourcesConfigPath);
    }
);

async function persistConfig(
    state: DataSourceConfigState,
    dataSourcesConfigPath?: string
) {
    const dir = await appDataDir();
    const path = await resolve(dir, dataSourcesConfigPath || DATA_SOURCES_CONFIG_FILENAME);
    await writeTextFile(path, JSON.stringify(state, null, 2));
}