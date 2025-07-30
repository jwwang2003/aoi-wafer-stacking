// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer from './slices/preferencesSlice';
import dataSourcePathsConfigReducer from './slices/dataSourcePathsConfigSlice';
import dataSourceStateReducer from './slices/dataSourceStateSlice';

const store = configureStore({
  reducer: {
    preferences: preferencesReducer,
    dataSourcePathsConfig: dataSourcePathsConfigReducer,
    dataSourceState: dataSourceStateReducer
  },
  // redux-thunk is included by default, so our async initConfigFilePath thunk will work out of the box
});

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;