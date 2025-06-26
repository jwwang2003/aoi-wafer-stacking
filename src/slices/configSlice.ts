// src/store/configSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PathsState {
  substratePaths: string[];
  fabCpPaths: string[];
  cp1Paths: string[];
  wlbiPaths: string[];
  cp2Paths: string[];
  aoiPaths: string[];
  lastModified: string;
}

interface RegexState {
  substrateRegex: string;
  fabCpRegex: string;
  cp1Regex: string;
  wlbiRegex: string;
  cp2Regex: string;
  aoiRegex: string;
  lastModified: string;
}

interface ConfigState {
  rootPath: string;
  rootLastModified: string;
  paths: PathsState;
  regex: RegexState;
  lastSaved: string;
}

type RegexKey = keyof RegexState;

const now = () => new Date().toISOString();

const initialState: ConfigState = {
  rootPath: '',
  rootLastModified: now(),
  paths: {
    substratePaths: [],
    fabCpPaths: [],
    cp1Paths: [],
    wlbiPaths: [],
    cp2Paths: [],
    aoiPaths: [],
    lastModified: now(),
  },
  regex: {
    substrateRegex: '^衬底$',
    fabCpRegex: 'CP',
    cp1Regex: 'CP-01',
    wlbiRegex: 'wlbi',
    cp2Regex: 'CP-prober-01',
    aoiRegex: 'AOI-01',
    lastModified: now(),
  },
  lastSaved: now(),
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    // —— Root path reducers ——
    setRootPath(state, action: PayloadAction<string>) {
      state.rootPath = action.payload;
      state.rootLastModified = now();
    },

    // —— Paths reducers ——
    setSubstratePaths(state, action: PayloadAction<string[]>) {
      state.paths.substratePaths = action.payload;
      state.paths.lastModified = now();
    },
    addSubstratePath(state, action: PayloadAction<string>) {
      if (!state.paths.substratePaths.includes(action.payload)) {
        state.paths.substratePaths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeSubstratePath(state, action: PayloadAction<string>) {
      state.paths.substratePaths = state.paths.substratePaths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setFabCpPaths(state, action: PayloadAction<string[]>) {
      state.paths.fabCpPaths = action.payload;
      state.paths.lastModified = now();
    },
    addFabCpPath(state, action: PayloadAction<string>) {
      if (!state.paths.fabCpPaths.includes(action.payload)) {
        state.paths.fabCpPaths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeFabCpPath(state, action: PayloadAction<string>) {
      state.paths.fabCpPaths = state.paths.fabCpPaths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setCp1Paths(state, action: PayloadAction<string[]>) {
      state.paths.cp1Paths = action.payload;
      state.paths.lastModified = now();
    },
    addCp1Path(state, action: PayloadAction<string>) {
      if (!state.paths.cp1Paths.includes(action.payload)) {
        state.paths.cp1Paths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeCp1Path(state, action: PayloadAction<string>) {
      state.paths.cp1Paths = state.paths.cp1Paths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setWlbiPaths(state, action: PayloadAction<string[]>) {
      state.paths.wlbiPaths = action.payload;
      state.paths.lastModified = now();
    },
    addWlbiPath(state, action: PayloadAction<string>) {
      if (!state.paths.wlbiPaths.includes(action.payload)) {
        state.paths.wlbiPaths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeWlbiPath(state, action: PayloadAction<string>) {
      state.paths.wlbiPaths = state.paths.wlbiPaths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setCp2Paths(state, action: PayloadAction<string[]>) {
      state.paths.cp2Paths = action.payload;
      state.paths.lastModified = now();
    },
    addCp2Path(state, action: PayloadAction<string>) {
      if (!state.paths.cp2Paths.includes(action.payload)) {
        state.paths.cp2Paths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeCp2Path(state, action: PayloadAction<string>) {
      state.paths.cp2Paths = state.paths.cp2Paths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setAoiPaths(state, action: PayloadAction<string[]>) {
      state.paths.aoiPaths = action.payload;
      state.paths.lastModified = now();
    },
    addAoiPath(state, action: PayloadAction<string>) {
      if (!state.paths.aoiPaths.includes(action.payload)) {
        state.paths.aoiPaths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeAoiPath(state, action: PayloadAction<string>) {
      state.paths.aoiPaths = state.paths.aoiPaths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    // —— Regex reducers ——
    setRegexPattern(state, action: PayloadAction<{ key: RegexKey; regex: string }>) {
      const { key, regex } = action.payload;
      state.regex[key] = regex;
      state.regex.lastModified = now();
    },

    // —— Main save reducer ——
    saveConfig(state) {
      state.lastSaved = now();
    },
  },
});

export const {
  setRootPath,
  setSubstratePaths,
  addSubstratePath,
  removeSubstratePath,
  setFabCpPaths,
  addFabCpPath,
  removeFabCpPath,
  setCp1Paths,
  addCp1Path,
  removeCp1Path,
  setWlbiPaths,
  addWlbiPath,
  removeWlbiPath,
  setCp2Paths,
  addCp2Path,
  removeCp2Path,
  setAoiPaths,
  addAoiPath,
  removeAoiPath,
  setRegexPattern,
  saveConfig,
} = configSlice.actions;

export default configSlice.reducer;