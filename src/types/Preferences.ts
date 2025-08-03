import { ConfigStepperState } from './Stepper';

export interface PreferencesState {
    preferenceFilePath: string;             // path to preferences.json (read-only)
    dataSourceConfigPath: string;          // path to data_sources.json
    offsets: OffsetConfig;
    
    // NOTE: DO NOT PERSIST
    stepper: ConfigStepperState;
    status: 'idle' | 'loading' | 'failed';
    error: string | null;
}

export interface OffsetConfig {
    xOffset: number;
    yOffset: number;
    leftOffset: number;
    rightOffset: number;
    topOffset: number;
    bottomOffset: number;
    scale: number;
    warp: number;
}