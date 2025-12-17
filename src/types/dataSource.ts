// NOTE: Paths stored in config are ABSOLUTE paths.

import type { FileInfo } from './ipc';

// PathsState is stored inside of the .json file
export type DataSourcePaths = {
    [K in DataSourceType]: string[]
}

export interface DataSourcePathsState extends DataSourcePaths {
    
}

// RegexState is stored inside of the .json file
export type DataSourceRegex = {
    [K in DataSourceType]: string;
}

export interface DataSourceRegexState extends DataSourceRegex {

}

// Main data structure to persist data source paths config
export interface DataSourceConfigState {
    rootPath: string;
    paths: DataSourcePathsState;
    regex: DataSourceRegexState;
}

export enum DataSourceType {
    Substrate = 'substrate',
    FabCp = 'fabCp',
    CpProber = 'cpProber',
    Wlbi = 'wlbi',
    Aoi = 'aoi'
}
// export type DataSourceType = "substrate" | "fabCp" | "cpProber" | "wlbi" | "aoi";

// NOTE: For dataSourceStateSlice

/**
 * Internal DS for tracking folder state
 * Grouped folders by data source type
 */
export type FolderGroups = {
    [K in DataSourceType]: Folder[];
};

export type FolderGroupsState = {
    [K in DataSourceType]: Folder[];
}

export interface Folder {
    id: string;
    path: string;           // ABSOLUTE PATH
    type: DataSourceType;

    info?: FileInfo;
    error: boolean;
}
