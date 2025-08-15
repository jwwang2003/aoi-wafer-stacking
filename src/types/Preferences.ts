import { ConfigStepperState } from './stepper';

export interface PreferencesState {
    preferenceFilePath: string;             // path to preferences.json (read-only)
    dataSourceConfigPath: string;          // path to data_sources.json
    
    // NOTE: DO NOT PERSIST
    stepper: ConfigStepperState;
    status: 'idle' | 'loading' | 'failed';
    error: string | null;
}