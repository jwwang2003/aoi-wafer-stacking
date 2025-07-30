import { DATA_SOURCES_CONFIG_FILENAME, PREFERENCES_FILENAME } from '@/constants';
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { appDataDir, resolve, BaseDirectory } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { initialPreferencesState as initialState } from '@/constants/default';

export const initPreferences = createAsyncThunk<
    { preferenceFilePath: string; dataSourcesConfigPath: string },
    void,
    { rejectValue: string }
>(
    'preferences/initPreferences',
    async (_, thunkAPI) => {
        try {
            const appDataDirPath = await appDataDir();

            const preferenceFilePath = await resolve(appDataDirPath, PREFERENCES_FILENAME);
            const defaultDataSourcesConfigPath = await resolve(appDataDirPath, DATA_SOURCES_CONFIG_FILENAME);

            let dataSourcesConfigPath: string;

            // TODO: fix any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let prefs: any = {};

            try {
                const prefText = await readTextFile(PREFERENCES_FILENAME, {
                    baseDir: BaseDirectory.AppData,
                });
                prefs = JSON.parse(prefText);

                dataSourcesConfigPath = prefs.dataSourcesConfigPath || defaultDataSourcesConfigPath;

                if (!prefs.preferenceFilePath) prefs.preferenceFilePath = preferenceFilePath;
                if (!prefs.dataSourcesConfigPath) prefs.dataSourcesConfigPath = dataSourcesConfigPath;
            } catch {
                dataSourcesConfigPath = defaultDataSourcesConfigPath;
            }

            // Save (or update) preferences.json before returning
            await writeTextFile(preferenceFilePath, JSON.stringify(prefs, null, 2));

            return prefs;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        setDataSourcesConfigPath(state, action: PayloadAction<string>) {
            state.dataSourcesConfigPath = action.payload;
            const newState = {
                preferenceFilePath: state.preferenceFilePath,
                dataSourcesConfigPath: state.dataSourcesConfigPath
            };

            appDataDir()
                .then(async (dir) => {
                    const prefPath = await resolve(dir, PREFERENCES_FILENAME);
                    await writeTextFile(
                        prefPath,
                        JSON.stringify(newState, null, 2)
                    );
                })
                .catch(console.error);

            return state;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(initPreferences.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(initPreferences.fulfilled, (state, action) => {
                state.status = 'idle';
                state.preferenceFilePath = action.payload.preferenceFilePath;
                state.dataSourcesConfigPath = action.payload.dataSourcesConfigPath;
            })
            .addCase(initPreferences.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload ?? 'Unknown error';
            });
    },
});

export const { setDataSourcesConfigPath } = preferencesSlice.actions;
export default preferencesSlice.reducer;