// src/store/waferSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SubstrateDefectRow, WaferMapRow } from '@/db/types'; // adjust path as needed

interface WaferState {
    waferSubstrate: SubstrateDefectRow | null;
    waferMaps: WaferMapRow[];
}

const initialState: WaferState = {
    waferSubstrate: null,
    waferMaps: [],
};

const stackingJobSlice = createSlice({
    name: 'wafer',
    initialState,
    reducers: {
        setJob(state, action: PayloadAction<{ substrate: SubstrateDefectRow | null, maps: WaferMapRow[] }>) {
            state.waferSubstrate = action.payload.substrate;
            state.waferMaps = action.payload.maps;
        },

        // Set or clear wafer substrate
        setJobSubstrate(state, action: PayloadAction<SubstrateDefectRow | null>) {
            state.waferSubstrate = action.payload;
        },

        // Set wafer maps list
        setJobMaps(state, action: PayloadAction<WaferMapRow[]>) {
            state.waferMaps = action.payload;
        },

        // Append maps (optional helper)
        addJobMaps(state, action: PayloadAction<WaferMapRow[]>) {
            state.waferMaps.push(...action.payload);
        },

        // Clear maps
        clearJob(state) {
            state.waferSubstrate = null;
            state.waferMaps = [];
        },
    },
});

export const {
    setJob,
    setJobSubstrate,
    setJobMaps,
    addJobMaps,
    clearJob,
} = stackingJobSlice.actions;

export default stackingJobSlice.reducer;
