export interface PreferencesState {
    preferenceFilePath: string;             // path to preferences.json (read-only)
    dataSourcesConfigPath: string;          // path to data_sources.json
    status: 'idle' | 'loading' | 'failed';
    error: string | null;
    stepper: number;
}