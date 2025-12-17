import { ConfigStepperState } from './stepper';

export interface PreferencesState {
    preferenceFilePath: string;             // path to preferences.json (read-only)
    dataSourceConfigPath: string;          // path to data_sources.json
    dieLayoutXlsPath: string;              // path to substrate die layout Excel

    autoTriggers: { [K in AutoTriggers]: boolean; }

    // SQL debug echo: when true, DB layer prints SQL logs
    sqlDebug: boolean;

    // NOTE: DO NOT PERSIST
    stepper: ConfigStepperState;
    error: string | null;
}

export enum AutoTriggers {
    folderDetection = 'folderDetection',
    search = 'search',
    ingest = 'ingest'
}
