// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import configReducer from './slices/configSlice';
import preferencesReducer from './slices/preferencesSlice';

const store = configureStore({
  reducer: {
    config: configReducer,
    preferences: preferencesReducer,
  },
  // redux-thunk is included by default, so our async initConfigFilePath thunk will work out of the box
});

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;