// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer from './slices/preferencesSlice';
import dataSourceConfigReducer from './slices/dataSourceConfigSlice';
import dataSourceStateReducer from './slices/dataSourceStateSlice';
import waferMetadataReducer from './slices/waferMetadataSlice';
import stackingJobReducer from './slices/job';
import loggingReducer from './slices/logSlice';
import authReducer from './slices/authSlice';

import { validationPersistenceMiddleware } from './slices/middleware';

const store = configureStore({
    reducer: {
        auth: authReducer,
        preferences: preferencesReducer,
        dataSourceConfig: dataSourceConfigReducer,
        dataSourceState: dataSourceStateReducer,
        waferMetadata: waferMetadataReducer,
        stackingJob: stackingJobReducer,
        log: loggingReducer,
    },
    middleware: (gDM) => gDM({
        serializableCheck: false
    }).concat(validationPersistenceMiddleware)
    // redux-thunk is included by default, so our async initConfigFilePath thunk will work out of the box
});

export default store;

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
