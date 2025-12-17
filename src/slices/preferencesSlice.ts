// react-redux
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '@/store';

// Tauri API
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { createDefaultPreferences, mergeDefinedKeys, prepPreferenceWriteOut } from '@/utils/helper';
import { isValidPreferences } from '@/utils/validators';

import { baseDir, PREFERENCES_FILENAME } from '@/constants';
import { initialPreferencesState as initialState } from '@/constants/default';

import { AutoTriggers, PreferencesState } from '@/types/preferences';
import { ConfigStepperState } from '@/types/stepper';

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
    'preferences/init',
    async (_, thunkAPI) => {
        let preferences: PreferencesState = { ...initialState };
        try {
            preferences = await createDefaultPreferences();

            let parsed: unknown = null;
            try {
                const result = await readTextFile(PREFERENCES_FILENAME, { baseDir });
                parsed = JSON.parse(result);
            } catch (err: unknown) {
                console.debug('%c[PREF. file check] assuming file DNE', 'color:#6b7280', err);
                console.info('%cCreating preferences file...', 'color:#2563eb');
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

            // Check if data source config file exists and progress to Subdirectories
            try {
                await readTextFile(preferences.dataSourceConfigPath, { baseDir });
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
            } catch (err: unknown) {
                console.debug('%c[DataSourcePaths file check] assuming file DNE', 'color:#6b7280', err);
            }

            await thunkAPI.dispatch(setStepper(ConfigStepperState.ConfigInfo)); // NOT valid yet...

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
>('preferences/revalidate', async (_, thunkAPI) => {
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

        const { stepper: _1, ...pref } = { ...merged }; // eslint-disable-line @typescript-eslint/no-unused-vars
        const { stepper: _2, ...prefCopy} = { ...preferences }; // eslint-disable-line @typescript-eslint/no-unused-vars

        if (JSON.stringify(pref) !== JSON.stringify(prefCopy)) {
            console.error('Preferences misalignment between current state & file');
            console.error({
                merged, preferences
            });
            return thunkAPI.rejectWithValue('Preferences misalignment between current state & file');
        }

        // Check if data source config file exists
            try {
                await readTextFile(preferences.dataSourceConfigPath, { baseDir });
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Subdirectories));
            } catch (err: unknown) {
                console.debug('%c[DataSourcePaths file check] assuming file DNE', 'color:#6b7280', err);
            }

        await thunkAPI.dispatch(advanceStepper(ConfigStepperState.ConfigInfo)); // NOT valid yet...

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
        setDieLayoutXlsPath(state, action: PayloadAction<string>) {
            state.dieLayoutXlsPath = action.payload;
        },
        setSqlDebug(state, action: PayloadAction<boolean>) {
            state.sqlDebug = action.payload;
        },
        advanceStepper(state, action: PayloadAction<ConfigStepperState>) {
            const current = state.stepper;
            const target = action.payload;
            if (current < target) {
                state.stepper = target;
            } else if (target == current) {
                // Do nothing if we are advancing the stepper into the same position
                // console.warn("Config stepper unchanged", state.stepper);
            } else {
                // Do nothing...
                // We cannot advance the stepper backwards
            }
        },
        setStepper(state, action: PayloadAction<ConfigStepperState>) {
            state.stepper = action.payload;
        },
        setAutoTriggerState(state, action: PayloadAction<{ target: AutoTriggers, value: boolean }>) {
            const { target, value } = action.payload;
            state.autoTriggers[target] = value;
        }
    },
    extraReducers: (builder) => {
        builder
            // for init preferences only
            .addCase(initPreferences.fulfilled, (_, action) => {
                action.payload.error = null;
                return action.payload;
            })
            .addCase(initPreferences.rejected, (state, action) => {
                state.stepper = ConfigStepperState.ConfigInfo;      // rollback
                state.error = action.payload ?? 'Unknown error';
            })

            .addCase(revalidatePreferencesFile.fulfilled, (state, action) => {
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
                        error: '设置文件(.json)无效'
                    }
                }
            })
            .addCase(revalidatePreferencesFile.rejected, (state, action) => {
                state.stepper = ConfigStepperState.Initial;      // rollback
                state.error = action.payload ?? 'Unknown error';
            })
    },
});

export const { setDataSourceConfigPath, setDieLayoutXlsPath, setSqlDebug, setAutoTriggerState, setStepper, advanceStepper } = preferencesSlice.actions;
export default preferencesSlice.reducer;
