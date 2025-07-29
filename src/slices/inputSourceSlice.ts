// src/store/inputSourcesSlice.ts

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { FileInfo } from '@tauri-apps/plugin-fs';

export type SourceKey = 
  | 'substrate' 
  | 'cp_prober'
  | 'wlbi'
  | 'aoi';

export interface Entry {
  path: string;
  info: FileInfo;
}

type InputSourcesState = Record<SourceKey, Entry[]>;

const initialState: InputSourcesState = {
  substrate: [],
  cp_prober: [],
  wlbi:      [],
  aoi:       [],
};

const inputSourcesSlice = createSlice({
  name: 'inputSources',
  initialState,
  reducers: {
    /** Replace the entire list for one source */
    setEntries: (
      state,
      action: PayloadAction<{ source: SourceKey; entries: Entry[] }>
    ) => {
      state[action.payload.source] = action.payload.entries;
    },
    /** Add a single folder entry */
    addEntry: (
      state,
      action: PayloadAction<{ source: SourceKey; entry: Entry }>
    ) => {
      state[action.payload.source].push(action.payload.entry);
    },
    /** Remove by exact path */
    removeEntry: (
      state,
      action: PayloadAction<{ source: SourceKey; path: string }>
    ) => {
      state[action.payload.source] = state[action.payload.source]
        .filter(e => e.path !== action.payload.path);
    },
    /** Clear all entries for a source */
    clearEntries: (
      state,
      action: PayloadAction<{ source: SourceKey }>
    ) => {
      state[action.payload.source] = [];
    },
  },
});

export const {
  setEntries,
  addEntry,
  removeEntry,
  clearEntries,
} = inputSourcesSlice.actions;
export default inputSourcesSlice.reducer;

/** Selector factory: get the array for a given sourceKey */
export const selectEntriesBySource =
  (source: SourceKey) =>
  (state: { inputSources: InputSourcesState }) =>
    state.inputSources[source];