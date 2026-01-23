import { createSlice } from '@reduxjs/toolkit';

interface ConsoleLogState {
    // Placeholder slice retained only to avoid breaking imports; no logging persisted anymore.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logs: any[];
}

const initialState: ConsoleLogState = { logs: [] };

const consoleLogSlice = createSlice({
    name: 'consoleLog',
    initialState,
    reducers: {},
});

export const { } = consoleLogSlice.actions;
export default consoleLogSlice.reducer;
