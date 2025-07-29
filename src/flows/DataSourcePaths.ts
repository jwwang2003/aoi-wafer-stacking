import {
    setAoiPaths,
    setCpProberPaths,
    setSubstratePaths,
    setWlbiPaths
} from '@/slices/dataSourcePathsConfigSlice';
import { AppDispatch } from '@/store';
import { DataSourceType } from '@/types/DataSource';
import React, { useRef } from 'react';
import { DirectorySelectListRef } from '@/components/DirectorySelectList';

/**
 * Represents a data source section in the flow, including type, display name, 
 * path state from the Redux store, and a dispatch-based change handler.
 */
export interface DataSourceFlowItem {
    type: DataSourceType; // Key used to identify the data source
    name: string;         // Display label for the data source
    selector: (state: any) => string[]; // Selector to get the current paths from Redux
    onChange: (newValue: any, dispatch: AppDispatch) => void; // Handler to update paths in Redux
    ref: React.RefObject<DirectorySelectListRef>
}

/**
 * Static configuration list for each supported data source.
 * Each entry links to the corresponding Redux state and update action.
 */
export const DataSources = (): DataSourceFlowItem[] => {
    const substrateRef = useRef<DirectorySelectListRef>(null);
    const cpProberRef = useRef<DirectorySelectListRef>(null);
    const wlbiRef = useRef<DirectorySelectListRef>(null);
    const aoiRef = useRef<DirectorySelectListRef>(null);

    return [
        {
            type: 'substrate',
            name: 'Substrate',
            selector: (s) => s.dataSourcePathsConfig.paths.SubstratePaths,
            onChange: (paths, d) => d(setSubstratePaths(paths)),
            ref: substrateRef,
        },
        {
            type: 'cp-prober',
            name: 'CP-PROBER',
            selector: (s) => s.dataSourcePathsConfig.paths.CpProberPaths,
            onChange: (paths, d) => d(setCpProberPaths(paths)),
            ref: cpProberRef,
        },
        {
            type: 'wlbi',
            name: 'WLBI',
            selector: (s) => s.dataSourcePathsConfig.paths.WlbiPaths,
            onChange: (paths, d) => d(setWlbiPaths(paths)),
            ref: wlbiRef,
        },
        {
            type: 'aoi',
            name: 'AOI',
            selector: (s) => s.dataSourcePathsConfig.paths.AoiPaths,
            onChange: (paths, d) => d(setAoiPaths(paths)),
            ref: aoiRef,
        },
    ]
} 