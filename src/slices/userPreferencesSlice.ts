// src/slices/userPreferencesSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { appConfigDir } from '@tauri-apps/api/path';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export const initConfigFilePath = createAsyncThunk<
  string,
  void,
  { rejectValue: string }
>(
  'preferences/initConfigFilePath',
  async (_, thunkAPI) => {
    try {
      const baseDir = await appConfigDir();
      const prefFileName = 'user-preferences.json';
      const configFileName = 'myapp-config.json';

      const prefFilePath = `${baseDir}/${prefFileName}`;
      const defaultConfigPath = `${baseDir}/${configFileName}`;

      // 1. Ensure preferences file exists
      if (!(await exists(prefFilePath))) {
        const defaultPrefs = { configFilePath: defaultConfigPath };
        await writeTextFile(
          prefFilePath,
          JSON.stringify(defaultPrefs, null, 2),
        );
      }

      // 2. Load preferences
      let prefs: { configFilePath: string };
      try {
        const prefText = await readTextFile(prefFilePath);
        prefs = JSON.parse(prefText);
      } catch {
        prefs = { configFilePath: defaultConfigPath };
      }

      // 3. Resolve config file path
      const cfgPath = prefs.configFilePath || defaultConfigPath;

      // 4. Ensure config file exists
      if (!(await exists(cfgPath))) {
        await writeTextFile(
          cfgPath,
          JSON.stringify({}, null, 2),
        );
      }

      return cfgPath;
    } catch (err: any) {
      return thunkAPI.rejectWithValue(err.message);
    }
  }
);

interface PreferencesState {
  configFilePath: string;
  status: 'idle' | 'loading' | 'failed';
  error: string | null;
}

const initialState: PreferencesState = {
  configFilePath: '',
  status: 'idle',
  error: null,
};

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    setConfigFilePath(state, action: PayloadAction<string>) {
      state.configFilePath = action.payload;

      // Persist the new preference immediately
      // (we need to know prefFilePath again)
      appConfigDir()
        .then((baseDir) => {
          const prefFileName = 'user-preferences.json';
          const prefFilePath = `${baseDir}/${prefFileName}`;
          console.log(prefFileName, prefFilePath);
          return writeTextFile(
            prefFilePath,
            JSON.stringify({ configFilePath: action.payload }, null, 2),
          );
        })
        .catch(console.error);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initConfigFilePath.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(initConfigFilePath.fulfilled, (state, action) => {
        state.status = 'idle';
        state.configFilePath = action.payload;
      })
      .addCase(initConfigFilePath.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Unknown error';
      });
  },
});

export const { setConfigFilePath } = preferencesSlice.actions;
export default preferencesSlice.reducer;