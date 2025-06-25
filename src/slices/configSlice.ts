import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ConfigState {
  rootPath: string;
  substratePath: string;
  fabCpPath: string;
  cp1Path: string;
  wlbiPath: string;
  cp2Path: string;
  aoiPath: string;
  regexPatterns: {
    substrateRegex: string;
    fabCpRegex: string;
    cp1Regex: string;
    wlbiRegex: string;
    cp2Regex: string;
    aoiRegex: string;
  };
}

// Type for the regex keys to ensure only valid keys are used
type RegexKey = keyof ConfigState['regexPatterns'];

const initialState: ConfigState = {
  rootPath: '',
  substratePath: '',
  fabCpPath: '',
  cp1Path: '',
  wlbiPath: '',
  cp2Path: '',
  aoiPath: '',
  regexPatterns: {
    substrateRegex: '^衬底$', // Matches "/衬底"
    fabCpRegex: 'CP', // Matches "/CP"
    cp1Regex: 'CP-01', // Matches "/CP-01"
    wlbiRegex: 'wlbi', // Matches "/wlbi"
    cp2Regex: 'CP-prober-01', // Matches "/CP-prober-01"
    aoiRegex: 'AOI-01', // Matches "/AOI-01"
  },
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    setRootPath(state, action: PayloadAction<string>) {
      state.rootPath = action.payload;
    },
    setSubstratePath(state, action: PayloadAction<string>) {
      state.substratePath = action.payload;
    },
    setFabCpPath(state, action: PayloadAction<string>) {
      state.fabCpPath = action.payload;
    },
    setCp1Path(state, action: PayloadAction<string>) {
      state.cp1Path = action.payload;
    },
    setWlbiPath(state, action: PayloadAction<string>) {
      state.wlbiPath = action.payload;
    },
    setCp2Path(state, action: PayloadAction<string>) {
      state.cp2Path = action.payload;
    },
    setAoiPath(state, action: PayloadAction<string>) {
      state.aoiPath = action.payload;
    },
    setRegexPattern(
      state,
      action: PayloadAction<{ key: RegexKey; regex: string }>
    ) {
      const { key, regex } = action.payload;
      state.regexPatterns[key] = regex;
    },
  },
});

export const {
  setRootPath,
  setSubstratePath,
  setFabCpPath,
  setCp1Path,
  setWlbiPath,
  setCp2Path,
  setAoiPath,
  setRegexPattern,
} = configSlice.actions;

export default configSlice.reducer;