import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { invokeParseDieLayoutXls } from '@/api/tauri/wafer';
import type { DieLayoutMap } from '@/types/ipc';
import type { RootState } from '@/store';

export interface WaferLayoutState {
    data: DieLayoutMap;
    status: 'idle' | 'loading' | 'failed';
    error: string | null;
}

const initialState: WaferLayoutState = {
    data: {},
    status: 'idle',
    error: null,
};

export const loadWaferLayouts = createAsyncThunk<
    DieLayoutMap,
    void,
    { state: RootState; rejectValue: string }
>('waferLayouts/load', async (_, thunkAPI) => {
    const path = thunkAPI.getState().preferences.dieLayoutXlsPath;
    if (!path) {
        return {}; // nothing to load
    }
    try {
        const map = await invokeParseDieLayoutXls(path);
        return map;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load wafer layout';
        return thunkAPI.rejectWithValue(message);
    }
});

const waferLayoutSlice = createSlice({
    name: 'waferLayouts',
    initialState,
    reducers: {
        clearWaferLayouts: () => initialState,
    },
    extraReducers: (builder) => {
        builder
            .addCase(loadWaferLayouts.pending, (state) => {
                state.status = 'loading';
                state.error = null;
            })
            .addCase(loadWaferLayouts.fulfilled, (state, action: PayloadAction<DieLayoutMap>) => {
                state.status = 'idle';
                state.data = action.payload;
                state.error = null;
            })
            .addCase(loadWaferLayouts.rejected, (state, action) => {
                state.status = 'failed';
                state.error = action.payload ?? 'Unknown error';
            });
    },
});

export const { clearWaferLayouts } = waferLayoutSlice.actions;
export default waferLayoutSlice.reducer;
