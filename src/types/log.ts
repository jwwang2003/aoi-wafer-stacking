export interface Log {
    method: string;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    data: any[];
    date?: string;
}

export interface ConsoleLogState {
    logs: Log[];
}
