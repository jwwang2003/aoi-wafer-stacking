// src/store/slices/consoleLogSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Methods } from 'console-feed/lib/definitions/Methods';

export interface Log {
    method: Methods;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    data: any[];
    date?: string;
}

interface ConsoleLogState {
    logs: Log[];
}

const initialState: ConsoleLogState = {
    logs: [],
};

const consoleLogSlice = createSlice({
    name: 'consoleLog',
    initialState,
    reducers: {
        addLog(state, action: PayloadAction<Log>) {
            state.logs.push(action.payload);
        },
        clearLogs(state) {
            state.logs = [];
        },
    },
});

export const { addLog, clearLogs } = consoleLogSlice.actions;
export default consoleLogSlice.reducer;
