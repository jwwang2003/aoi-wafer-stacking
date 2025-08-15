// src/store/slices/consoleLogSlice.ts
import { Log } from '@/types/log';
import { initialLogState as initialState } from '@/constants/default';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';


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
