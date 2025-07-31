import { DATA_SOURCES_CONFIG_FILENAME, PREFERENCES_FILENAME } from '@/constants';
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { appDataDir, resolve, BaseDirectory } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { initialPreferencesState as initialState } from '@/constants/default';
import { PreferencesState } from '@/types/Preferences';

export const initPreferences = createAsyncThunk<
    PreferencesState,
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

            let prefs: PreferencesState = { ...initialState, preferenceFilePath };
            try {
                const prefText = await readTextFile(PREFERENCES_FILENAME, {
                    baseDir: BaseDirectory.AppData,
                });
                const prefRead = JSON.parse(prefText);
                prefs = { ...prefRead };
                dataSourcesConfigPath = prefs.dataSourcesConfigPath || defaultDataSourcesConfigPath;
                if (!prefs.preferenceFilePath) prefs.preferenceFilePath = preferenceFilePath;
                if (!prefs.dataSourcesConfigPath) prefs.dataSourcesConfigPath = dataSourcesConfigPath;
            } catch {
                prefs.dataSourcesConfigPath = defaultDataSourcesConfigPath;
            }

            prefs.stepper = 1;

            // Save (or update) preferences.json before returning
            await writeTextFile(
                PREFERENCES_FILENAME,
                JSON.stringify(prefs, null, 2),
                {
                    baseDir: BaseDirectory.AppData
                }
            );

            return prefs;
        } catch (err: unknown) {
            const errorMessage = err as string;
            return thunkAPI.rejectWithValue(errorMessage);
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
                // excludes everything else
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
        setStepperStep(state, action: PayloadAction<number>) {
            state.stepper = action.payload;
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
                state.stepper = action.payload.stepper;
            })
            .addCase(initPreferences.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload ?? 'Unknown error';
            });
    },
});

export const { setDataSourcesConfigPath, setStepperStep } = preferencesSlice.actions;
export default preferencesSlice.reducer;