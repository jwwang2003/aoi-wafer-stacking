// react-redux
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';

// Tauri API
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// local imports
import { baseDir, PREFERENCES_FILENAME } from '@/constants';
import { initialPreferencesState as initialState } from '@/constants/default';
import { OffsetConfig, PreferencesState } from '@/types/Preferences';
import { createDefaultPreferences, mergeDefinedKeys, prepPreferenceWriteOut } from '@/utils/helper';
import { ConfigStepperState } from '@/types/Stepper';
import { isValidPreferences } from '@/utils/validators';
import { RootState } from '@/store';

/**
 * The preferences init function has the responsibility of:
 * - checking if a config file exists
 *      - if the file exists: read the file from FS (default path) & parse its config variables
 *      - if DNE: create a new file using the default value
 * - the preferences config file tracks the following variables:
 *      - the preferences file path (.json)
 *      - data source paths config file (.json)
 *      - wafer offset values
 *      - ...
 * - note that all the paths are relative to this specific system, therefore, it is NOT portable
 * - albeit some properties of the preferences config ARE portable
 * - NOTE: technically this func. should only be called ONCE when the app loads
 */
export const initPreferences = createAsyncThunk<
    PreferencesState,
    void,
    { rejectValue: string }
>(
    'preferences/initPreferences',
    async (_, thunkAPI) => {
        let preferences: PreferencesState = { ...initialState };
        try {
            preferences = await createDefaultPreferences();

            let parsed: unknown = null;
            try {
                const result = await readTextFile(PREFERENCES_FILENAME, { baseDir });
                parsed = JSON.parse(result);
            } catch (err: unknown) {
                console.debug('[PREF. file check] assuming file DNE', err);
                console.debug('Creating preferences file...');
                const data = prepPreferenceWriteOut(preferences);
                await writeTextFile(PREFERENCES_FILENAME, data, { baseDir });
                const result = await readTextFile(PREFERENCES_FILENAME, { baseDir });
                parsed = JSON.parse(result);
            }

            // Only merge if parsed file is structurally valid
            if (isValidPreferences(parsed)) {
                preferences = mergeDefinedKeys(preferences, parsed);
            } else {
                console.warn('[PREF. validation] invalid preferences structure, using defaults');
            }

            // Check if data source config file exists
            try {
                await readTextFile(preferences.dataSourceConfigPath, { baseDir });
            } catch (err: unknown) {
                console.debug('[DataSourcePaths file check] assuming file DNE', err);
            }

            return preferences;
        } catch (err: unknown) {
            return thunkAPI.rejectWithValue(err instanceof Error ? err.message : 'Unknown error');
        }
    }
);

/**
 * Revalidates the existing preferences.json file.
 * - does not write to disk
 * - does not advance stepper
 * - can be used anytime to safely check file validity
 */
export const revalidatePreferencesFile = createAsyncThunk<
    { preferences: PreferencesState; valid: boolean },
    void,
    { state: RootState, rejectValue: string }
>('preferences/revalidatePreferencesFile', async (_, thunkAPI) => {
    try {
        const { preferences } = thunkAPI.getState();
        const defaultPref = await createDefaultPreferences();

        const raw = await readTextFile(PREFERENCES_FILENAME, { baseDir });
        const parsed = JSON.parse(raw);

        if (!isValidPreferences(parsed)) {
            return {
                valid: false,
                preferences: defaultPref,
            };
        }

        const merged = mergeDefinedKeys(defaultPref, parsed);
        if (!isValidPreferences(merged)) {
            return {
                valid: false,
                preferences: defaultPref,
            };
        }

        const old = merged.stepper;
        const prefCopy = { ...preferences };

        merged.stepper = ConfigStepperState.Initial;
        prefCopy.stepper = ConfigStepperState.Initial;

        if (JSON.stringify(merged) !== JSON.stringify(prefCopy)) {
            console.error('Preferences misalignment between current state & file');
            console.error({
                merged, preferences
            });
            return thunkAPI.rejectWithValue('Preferences misalignment between current state & file');
        }

        merged.stepper = old;
        return {
            valid: true,
            preferences: merged,
        };
    } catch (err: unknown) {
        // const fallback = await createDefaultPreferences();
        if (err instanceof Error)
            return thunkAPI.rejectWithValue(err.message);
        else if (typeof err === 'string')
            return thunkAPI.rejectWithValue(err);
        return thunkAPI.rejectWithValue('');
    }
});

/**
 * Completely overwrites preferences.json with default values
 * - force-resets both file and Redux state
 * - this is a destructive operation
 */
export const resetPreferencesToDefault = createAsyncThunk<
    PreferencesState,
    void,
    { rejectValue: string }
>('preferences/resetPreferencesToDefault', async (_, thunkAPI) => {
    try {
        const defaultPref = await createDefaultPreferences();
        const data = prepPreferenceWriteOut(defaultPref);
        await writeTextFile(PREFERENCES_FILENAME, data, { baseDir });

        return defaultPref;
    } catch (err: unknown) {
        return thunkAPI.rejectWithValue(
            err instanceof Error ? err.message : 'Unknown error'
        );
    }
});

const preferencesSlice = createSlice({
    name: 'preferences',
    initialState,
    reducers: {
        setDataSourceConfigPath(state, action: PayloadAction<string>) {
            state.dataSourceConfigPath = action.payload;    // set the new value
            // no need to save because the middleware takes care of that
        },
        setOffsets(state, action: PayloadAction<Partial<OffsetConfig>>) {
            state.offsets = {
                ...state.offsets,
                ...action.payload,
            };
        },
        setStepper(state, action: PayloadAction<ConfigStepperState>) {
            state.stepper = action.payload;
            switch (state.stepper) {
                case ConfigStepperState.Initial:
                    break;
                case ConfigStepperState.ConfigInfo:
                    break;
                case ConfigStepperState.RootDirectory:
                    break;
                case ConfigStepperState.Subdirectories:
                    break;
                case ConfigStepperState.DeviceData:
                    break;
                default:
                    break;
            }
            return state;
        }
    },
    extraReducers: (builder) => {
        builder
            // for init preferences only
            .addCase(initPreferences.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(initPreferences.fulfilled, (state, action) => {
                state.status = 'idle';
                state.error = null;
                if (action.payload.stepper <= ConfigStepperState.ConfigInfo) {
                    state.stepper = ConfigStepperState.ConfigInfo + 1;     // move to next state
                }
                const { preferenceFilePath, dataSourceConfigPath } = action.payload;
                state.preferenceFilePath = preferenceFilePath;
                state.dataSourceConfigPath = dataSourceConfigPath;
            })
            .addCase(initPreferences.rejected, (state, action) => {
                state.stepper = ConfigStepperState.ConfigInfo;      // rollback
                state.status = 'failed';
                state.error = action.payload ?? 'Unknown error';
                // return action.payload;
            })

            .addCase(revalidatePreferencesFile.fulfilled, (state, action) => {
                state.status = 'idle';
                state.error = null;

                const { preferenceFilePath, dataSourceConfigPath } = action.payload.preferences;
                state = {
                    ...state,
                    preferenceFilePath,
                    dataSourceConfigPath
                };

                if (!action.payload.valid) {
                    state = {
                        ...state,
                        status: 'failed',
                        error: '设置文件(.json)无效'
                    }
                }
            })
            .addCase(revalidatePreferencesFile.rejected, (state, action) => {
                state.stepper = ConfigStepperState.ConfigInfo;      // rollback
                state.status = 'failed';
                state.error = action.payload ?? 'Unknown error';
            })
    },
});

export const { setDataSourceConfigPath, setOffsets, setStepper } = preferencesSlice.actions;
export default preferencesSlice.reducer;