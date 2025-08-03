import { PreferencesState } from '@/types/Preferences';
import { DataSourceConfigState, FolderGroupsState } from '@/types/DataSource';
import { ConfigStepperState } from '@/types/Stepper';
import { WaferMetadataState } from '@/types/Wafer';

export const now = () => new Date().toISOString();

export const initialPreferencesState: PreferencesState = {
    preferenceFilePath: '',
    dataSourceConfigPath: '',
    offsets: {
        xOffset: 0,
        yOffset: 0,
        leftOffset: 0,
        rightOffset: 0,
        topOffset: 0,
        bottomOffset: 0,
        scale: 1,
        warp: 0,
    },

    // NOTE: DO NOT PERSIST
    stepper: ConfigStepperState.Initial,
    status: 'idle',
    error: null,
};

export const initialDataSourcePathsConfigState: DataSourceConfigState = {
    rootPath: '',
    rootLastModified: now(),
    paths: {
        substrate: [],
        cpProber: [],
        fabCp: [],
        wlbi: [],
        aoi: [],
        lastModified: now(),
    },
    regex: {
        substrate: 'Substrate',
        cpProber: 'CP-prober-[A-Za-z0-9]+',
        fabCp: 'FAB CP',
        wlbi: 'WLBI-[A-Za-z0-9]+',
        aoi: 'AOI-[A-Za-z0-9]+',
        lastModified: now(),
    },
    lastSaved: now(),
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

export const initialWaferMetadataState: WaferMetadataState = {
    data: {
        substrate: [],
        fabCp: [],
        cpProber: [],
        wlbi: [],
        aoi: [],
    },
    lastSaved: now(),
};