import { Methods } from 'console-feed/lib/definitions/Methods';

export interface Log {
    method: Methods;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    data: any[];
    date?: string;
}

export interface ConsoleLogState {
    logs: Log[];
}