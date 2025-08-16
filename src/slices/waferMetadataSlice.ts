import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '@/store';
import { advanceStepper, setStepper } from './preferencesSlice';

import {RawWaferMetadataCollection } from '@/types/wafer';
import { ConfigStepperState } from '@/types/stepper';

import { initialWaferMetadataState as initialState } from '@/constants/default';
import { getAllWaferFolders, readAllWaferData } from '@/utils/dataSource';

/**
 * This slice is responsible for keeping track of the data read from the data source folders.
 * Whenever a change happens to dataSourceConfig.paths[...] (... is a stage), the same
 * change should be applied here. For example, a new path gets added or an old path gets deleted.
 */

// Async thunk to fetch and parse all wafer metadata
export const fetchWaferMetadata = createAsyncThunk<
    RawWaferMetadataCollection,
    void,
    { state: RootState; rejectValue: string }
>(
    'waferMetadata/fetch',
    async (_, thunkAPI) => {
        try {
            const { dataSourceState } = thunkAPI.getState();

            // start timer
            const start = performance.now();

            const dataSourcePaths = await getAllWaferFolders(dataSourceState);
            const parsed: RawWaferMetadataCollection = await readAllWaferData(dataSourcePaths);

            // end timer & compute duration
            const duration = performance.now() - start;
            console.debug(`%cRead & parse wafer metadata (${duration.toFixed(0)}ms)`, 'color: orange;')

            // advance stepper based on result
            if (parsed.length > 0) {
                await thunkAPI.dispatch(advanceStepper(ConfigStepperState.Database));
            } else {
                await thunkAPI.dispatch(setStepper(ConfigStepperState.Metadata));
            }

            console.log(parsed);

            return parsed;
        } catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : 'Failed to fetch wafer metadata';

            return thunkAPI.rejectWithValue(message);
        }
    }
);

const waferMetadataSlice = createSlice({
    name: 'waferMetadata',
    initialState,
    reducers: {
        clearWaferMetadata() {
            return [];
        },
    },
    extraReducers: (builder) => {
        builder
            // .addCase(fetchWaferMetadata.pending, () => {})
            // .addCase(fetchWaferMetadata.rejected, () => {})
            .addCase(fetchWaferMetadata.fulfilled, (_, action: PayloadAction<RawWaferMetadataCollection>) => {
                return action.payload;
            });
    },
});

export const { clearWaferMetadata } = waferMetadataSlice.actions;
export default waferMetadataSlice.reducer;

//======================================================================================================================

// NOTE: Helper methods moved to utils/dataSource.ts