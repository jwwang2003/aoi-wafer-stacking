import { PreferencesState } from '@/types/preferences';
import { DataSourceConfigState, FolderGroupsState } from '@/types/dataSource';
import { ConfigStepperState } from '@/types/stepper';
import { RawWaferMetadataCollection } from '@/types/wafer';
import { ConsoleLogState } from '@/types/log';

export const now = () => new Date().toISOString();

export const initialPreferencesState: PreferencesState = {
    preferenceFilePath: '',
    dataSourceConfigPath: '',
    autoTriggers: {
        folderDetection: false,
        search: false,
        ingest: false,
    },

    // NOTE: DO NOT PERSIST
    stepper: ConfigStepperState.Initial,
    status: 'idle',
    error: null,
};

export const initialDataSourceConfigState: DataSourceConfigState = {
    rootPath: '',
    paths: {
        substrate: [],
        cpProber: [],
        fabCp: [],
        wlbi: [],
        aoi: [],
    },
    regex: {
        substrate: 'Substrate',
        cpProber: 'CP-prober-[A-Za-z0-9]+',
        fabCp: 'FAB CP',
        wlbi: 'WLBI-[A-Za-z0-9]+',
        aoi: 'AOI-[A-Za-z0-9]+',
    },
};

/**
 * DEFAULT VALUES for dataSourceStateSlice.ts
 */
export const initialDataSourceState: FolderGroupsState = {
    substrate: [],
    fabCp: [],
    cpProber: [],
    wlbi: [],
    aoi: [],
};

export const initialWaferMetadataState: RawWaferMetadataCollection = [];

export const initialLogState: ConsoleLogState = {
    logs: [],
};
