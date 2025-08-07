// src/services/consoleInterceptor.ts
import { Hook } from 'console-feed';
import store from '@/store';
import { addLog } from '@/slices/logSlice';
import { Log } from '@/types/Log';

let alreadyHooked = false;

export function initConsoleInterceptor() {
    if (alreadyHooked) return;
    alreadyHooked = true;

    Hook(window.console, (log) => {
        store.dispatch(addLog({ ...log as Log, date: new Date().toISOString() }));
    }, false);
}