import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PathsState {
  substratePaths: string[];
  cp1Paths: string[];
  cp2Paths: string[];
  wlbiPaths: string[];
  cp3Paths: string[];
  aoiPaths: string[];
  lastModified: string;
}

interface RegexState {
  substrateRegex: string;
  cp1Regex: string;
  cp2Regex: string;
  wlbiRegex: string;
  cp3Regex: string;
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
    substratePaths: [],
    cp1Paths: [],
    cp2Paths: [],
    wlbiPaths: [],
    cp3Paths: [],
    aoiPaths: [],
    lastModified: now(),
  },
  regex: {
    substrateRegex: '^衬底$',
    cp1Regex: 'CP-01',
    cp2Regex: 'CP-prober-01',
    wlbiRegex: 'wlbi',
    cp3Regex: 'CP-03',
    aoiRegex: 'AOI-01',
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
      if (!arraysAreEqual(state.paths.substratePaths, action.payload)) {
        state.paths.substratePaths = action.payload;
        state.paths.lastModified = now();
      }
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

    setCp1Paths(state, action: PayloadAction<string[]>) {
      if (!arraysAreEqual(state.paths.cp1Paths, action.payload)) {
        state.paths.cp1Paths = action.payload;
        state.paths.lastModified = now();
      }
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

    setCp2Paths(state, action: PayloadAction<string[]>) {
      if (!arraysAreEqual(state.paths.cp2Paths, action.payload)) {
        state.paths.cp2Paths = action.payload;
        state.paths.lastModified = now();
      }
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

    setWlbiPaths(state, action: PayloadAction<string[]>) {
      if (!arraysAreEqual(state.paths.wlbiPaths, action.payload)) {
        state.paths.wlbiPaths = action.payload;
        state.paths.lastModified = now();
      }
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

    setCp3Paths(state, action: PayloadAction<string[]>) {
      if (!arraysAreEqual(state.paths.cp3Paths, action.payload)) {
        state.paths.cp3Paths = action.payload;
        state.paths.lastModified = now();
      }
    },
    addCp3Path(state, action: PayloadAction<string>) {
      if (!state.paths.cp3Paths.includes(action.payload)) {
        state.paths.cp3Paths.push(action.payload);
        state.paths.lastModified = now();
      }
    },
    removeCp3Path(state, action: PayloadAction<string>) {
      state.paths.cp3Paths = state.paths.cp3Paths.filter(p => p !== action.payload);
      state.paths.lastModified = now();
    },

    setAoiPaths(state, action: PayloadAction<string[]>) {
      if (!arraysAreEqual(state.paths.aoiPaths, action.payload)) {
        state.paths.aoiPaths = action.payload;
        state.paths.lastModified = now();
      }
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
});

export const {
  setRootPath,
  setSubstratePaths,
  addSubstratePath,
  removeSubstratePath,
  setCp1Paths,
  addCp1Path,
  removeCp1Path,
  setCp2Paths,
  addCp2Path,
  removeCp2Path,
  setWlbiPaths,
  addWlbiPath,
  removeWlbiPath,
  setCp3Paths,
  addCp3Path,
  removeCp3Path,
  setAoiPaths,
  addAoiPath,
  removeAoiPath,
  setRegexPattern,
  saveConfig,
} = configSlice.actions;

export default configSlice.reducer;