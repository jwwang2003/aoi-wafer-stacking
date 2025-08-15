import { setDataSourcePaths } from '@/slices/dataSourceConfigSlice';
import { AppDispatch, RootState } from '@/store';
import { DataSourceType, Folder } from '@/types/dataSource';
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
export const DataSources: DataSourceFlowItem[] = [
    {
        type: DataSourceType.Substrate,
        name: 'Substrate',
        selector: (s) => s.dataSourceState['substrate'],
        onChange: (paths, d) => d(setDataSourcePaths({ type: DataSourceType.Substrate, paths })),
    },
    {
        type: DataSourceType.FabCp,
        name: 'FAB CP',
        selector: (s) => s.dataSourceState['fabCp'],
        onChange: (paths, d) => d(setDataSourcePaths({ type: DataSourceType.FabCp, paths })),
    },
    {
        type: DataSourceType.CpProber,
        name: 'CP-PROBER',
        selector: (s) => s.dataSourceState['cpProber'],
        onChange: (paths, d) => d(setDataSourcePaths({ type: DataSourceType.CpProber, paths })),
    },
    {
        type: DataSourceType.Wlbi,
        name: 'WLBI',
        selector: (s) => s.dataSourceState['wlbi'],
        onChange: (paths, d) => d(setDataSourcePaths({ type: DataSourceType.Wlbi, paths })),
    },
    {
        type: DataSourceType.Aoi,
        name: 'AOI',
        selector: (s) => s.dataSourceState['aoi'],
        onChange: (paths, d) => d(setDataSourcePaths({ type: DataSourceType.Aoi, paths })),
    },
]

// Refer to types/Stepper.ts
export const DataSourceFlowSteps = [
    // StepperModuleState.ConfigInfo
    { label: '配置信息', description: '读取配置信息' },
    // StepperModuleState.RootDirectory
    { label: '根目录', description: '根目录路径有效' },
    // StepperModuleState.Subdirectories
    { label: '子目录', description: '读取子目录的Maps' },
    // StepperModuleState.Metadata
    { label: '加载', description: '读取元数据' },
    // StepperModuleState.Database
    { label: '数据库', description: '维护数据库' },
];