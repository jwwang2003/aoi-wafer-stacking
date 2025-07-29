import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { appDataDir, BaseDirectory, resolve } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { DATA_SOURCES_CONFIG_FILENAME } from '@/constants';
import { RootState } from "@/store";
import { RegexState, ConfigState } from '@/types/DataSource';
import { sortBySubfolderName } from '@/utils/fs';

type RegexKey = keyof RegexState;

const now = () => new Date().toISOString();

export const initDataSourceConfig = createAsyncThunk<
    ConfigState,
    { dataSourcesConfigPath: string },
    { rejectValue: string }
>(
    'config/initDataSourceConfig',
    async ({ dataSourcesConfigPath }, thunkAPI) => {
        try {
            const appDataDirPath = await appDataDir();
            const path = await resolve(appDataDirPath, dataSourcesConfigPath || DATA_SOURCES_CONFIG_FILENAME);

            let config: ConfigState = initialState;

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

            console.log(config);

            return config;
        } catch (err: any) {
            return thunkAPI.rejectWithValue(err.message);
        }
    }
);

function arraysAreEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
}

const initialState: ConfigState = {
    rootPath: '',
    rootLastModified: now(),
    paths: {
        SubstratePaths: [],
        CpProberPaths: [],
        WlbiPaths: [],
        AoiPaths: [],
        lastModified: now(),
    },
    regex: {
        SubstrateRegex: 'Substrate',
        CpProberRegex: 'CP-prober-[A-Za-z0-9]+',
        WlbiRegex: 'WLBI-[A-Za-z0-9]+',
        AoiRegex: 'AOI-[A-Za-z0-9]+',
        lastModified: now(),
    },
    lastSaved: now(),
};

const configSlice = createSlice({
    name: 'config',
    initialState,
    reducers: {
        // —— Root path reducer ——
        setRootPath(state, action: PayloadAction<string>) {
            state.rootPath = action.payload;
            state.rootLastModified = now();
        },

        // —— Paths reducers ——
        setSubstratePaths(state, action: PayloadAction<string[]>) {
            const sorted = sortBySubfolderName(action.payload);
            if (!arraysAreEqual(state.paths.SubstratePaths, sorted)) {
                state.paths.SubstratePaths = sorted;
                state.paths.lastModified = now();
            }
        },
        addSubstratePath(state, action: PayloadAction<string>) {
            if (!state.paths.SubstratePaths.includes(action.payload)) {
                state.paths.SubstratePaths.push(action.payload);
                state.paths.SubstratePaths = sortBySubfolderName(state.paths.SubstratePaths);
                state.paths.lastModified = now();
            }
        },
        removeSubstratePath(state, action: PayloadAction<string>) {
            state.paths.SubstratePaths = state.paths.SubstratePaths.filter(p => p !== action.payload);
            state.paths.lastModified = now();
        },

        setCpProberPaths(state, action: PayloadAction<string[]>) {
            const sorted = sortBySubfolderName(action.payload);
            if (!arraysAreEqual(state.paths.CpProberPaths, sorted)) {
                state.paths.CpProberPaths = sorted;
                state.paths.lastModified = now();
            }
        },
        addCpProberPaths(state, action: PayloadAction<string>) {
            if (!state.paths.CpProberPaths.includes(action.payload)) {
                state.paths.CpProberPaths.push(action.payload);
                state.paths.CpProberPaths = sortBySubfolderName(state.paths.CpProberPaths);
                state.paths.lastModified = now();
            }
        },
        removeCpProberPaths(state, action: PayloadAction<string>) {
            state.paths.CpProberPaths = state.paths.CpProberPaths.filter(p => p !== action.payload);
            state.paths.lastModified = now();
        },

        setWlbiPaths(state, action: PayloadAction<string[]>) {
            const sorted = sortBySubfolderName(action.payload);
            if (!arraysAreEqual(state.paths.WlbiPaths, sorted)) {
                state.paths.WlbiPaths = sorted;
                state.paths.lastModified = now();
            }
        },
        addWlbiPath(state, action: PayloadAction<string>) {
            if (!state.paths.WlbiPaths.includes(action.payload)) {
                state.paths.WlbiPaths.push(action.payload);
                state.paths.WlbiPaths = sortBySubfolderName(state.paths.WlbiPaths);
                state.paths.lastModified = now();
            }
        },
        removeWlbiPath(state, action: PayloadAction<string>) {
            state.paths.WlbiPaths = state.paths.WlbiPaths.filter(p => p !== action.payload);
            state.paths.lastModified = now();
        },

        setAoiPaths(state, action: PayloadAction<string[]>) {
            const sorted = sortBySubfolderName(action.payload);
            if (!arraysAreEqual(state.paths.AoiPaths, sorted)) {
                state.paths.AoiPaths = sorted;
                state.paths.lastModified = now();
            }
        },
        addAoiPath(state, action: PayloadAction<string>) {
            if (!state.paths.AoiPaths.includes(action.payload)) {
                state.paths.AoiPaths.push(action.payload);
                state.paths.AoiPaths = sortBySubfolderName(state.paths.AoiPaths);
                state.paths.lastModified = now();
            }
        },
        removeAoiPath(state, action: PayloadAction<string>) {
            state.paths.AoiPaths = state.paths.AoiPaths.filter(p => p !== action.payload);
            state.paths.lastModified = now();
        },

        // —— Regex reducer ——
        setRegexPattern(state, action: PayloadAction<{ key: RegexKey; regex: string }>) {
            const { key, regex } = action.payload;
            if (state.regex[key] !== regex) {
                state.regex[key] = regex;
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
    setSubstratePaths,
    addSubstratePath,
    removeSubstratePath,
    setCpProberPaths,
    addCpProberPaths,
    removeCpProberPaths,
    setWlbiPaths,
    addWlbiPath,
    removeWlbiPath,
    setAoiPaths,
    addAoiPath,
    removeAoiPath,
    setRegexPattern,
    saveConfig,
} = configSlice.actions;

export default configSlice.reducer;

export const saveConfigToDisk = createAsyncThunk<
    void,
    void,
    { state: RootState }
>(
    'config/saveToDisk',
    async (_, thunkAPI) => {
        const state = thunkAPI.getState();
        const config = state.dataSourcePathsConfig;
        const preferences = state.preferences;

        await persistConfig(config, preferences.dataSourcesConfigPath);
    }
);

async function persistConfig(
    state: ConfigState,
    dataSourcesConfigPath?: string
) {
    const dir = await appDataDir();
    const path = await resolve(dir, dataSourcesConfigPath || DATA_SOURCES_CONFIG_FILENAME);
    await writeTextFile(path, JSON.stringify(state, null, 2));
}