import { PreferencesState } from '@/types/Preferences';
import { DataSourceConfigState, FolderGroupsState } from '@/types/DataSource';


export const now = () => new Date().toISOString();

export const initialPreferencesState: PreferencesState = {
    preferenceFilePath: '',
    dataSourcesConfigPath: '',
    status: 'idle',
    error: null,
    stepper: 0
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