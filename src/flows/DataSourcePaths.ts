import { setDataSoucePaths } from '@/slices/dataSourcePathsConfigSlice';
import { AppDispatch, RootState } from '@/store';
import { DataSourceType, Folder } from '@/types/DataSource';
/**
 * Represents a data source section in the flow, including type, display name, 
 * path state from the Redux store, and a dispatch-based change handler.
 */
export interface DataSourceFlowItem {
    type: DataSourceType; // Key used to identify the data source
    name: string;         // Display label for the data source
    selector: (state: RootState) => Folder[]; // Selector to get the current paths from Redux
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChange: (newValue: any, dispatch: AppDispatch) => void; // Handler to update paths in Redux
}

/**
 * Static configuration list for each supported data source.
 * Each entry links to the corresponding Redux state and update action.
 */
export const DataSources = (): DataSourceFlowItem[] => {
    return [
        {
            type: 'substrate',
            name: 'Substrate',
            selector: (s) => s.dataSourceState['substrate'],
            onChange: (paths, d) => d(setDataSoucePaths({ type: 'substrate', paths})),
        },
        {
            type: 'fabCp',
            name: 'FAB CP',
            selector: (s) => s.dataSourceState['fabCp'],
            onChange: (paths, d) => d(setDataSoucePaths({ type: 'fabCp', paths})),
        },
        {
            type: 'cpProber',
            name: 'CP-PROBER',
            selector: (s) => s.dataSourceState['cpProber'],
            onChange: (paths, d) => d(setDataSoucePaths({ type: 'cpProber', paths})),
        },
        {
            type: 'wlbi',
            name: 'WLBI',
            selector: (s) => s.dataSourceState['wlbi'],
            onChange: (paths, d) => d(setDataSoucePaths({ type: 'wlbi', paths})),
        },
        {
            type: 'aoi',
            name: 'AOI',
            selector: (s) => s.dataSourceState['aoi'],
            onChange: (paths, d) => d(setDataSoucePaths({ type: 'aoi', paths})),
        },
    ]
} 