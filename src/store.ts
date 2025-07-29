// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import dataSourcePathsconfigReducer from './slices/dataSourcePathsConfigSlice';
import preferencesReducer from './slices/preferencesSlice';

const store = configureStore({
  reducer: {
    dataSourcePathsConfig: dataSourcePathsconfigReducer,
    preferences: preferencesReducer,
  },
  // redux-thunk is included by default, so our async initConfigFilePath thunk will work out of the box
});

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;