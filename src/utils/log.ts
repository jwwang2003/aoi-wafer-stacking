// src/services/consoleInterceptor.ts
import { Hook } from 'console-feed';
import store from '@/store';
import { addLog, Log } from '@/slices/logSlice';

let alreadyHooked = false;

export function initConsoleInterceptor() {
    if (alreadyHooked) return;
    alreadyHooked = true;

    Hook(window.console, (log) => {
        store.dispatch(addLog({ ...log as Log, date: new Date().toISOString() }));
    }, false);
}