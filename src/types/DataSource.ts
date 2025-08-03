// NOTE: that these paths are all relative to the root folder

import { FileInfo } from '@tauri-apps/plugin-fs';

// PathsState is stored inside of the .json file
export type DataSourcePaths = {
    [K in DataSourceType]: string[]
}

export interface DataSourcePathsState extends DataSourcePaths {
    lastModified: string;
}

// RegexState is stored inside of the .json file
export type DataSourceRegex = {
    [K in DataSourceType]: string;
}

export interface DataSourceRegexState extends DataSourceRegex {
    lastModified: string;
}

// Main data structure to persist data source paths config
export interface DataSourceConfigState {
    rootPath: string;
    rootLastModified: string;
    paths: DataSourcePathsState;
    regex: DataSourceRegexState;

    lastSaved: string;
}


// TODO: Add support for 'fab-cp' paths
export type DataSourceType =
    'substrate' | 'fabCp' | 'cpProber' | 'wlbi' | 'aoi';
// 'substrate' | 'fabCp' | 'cpProber' | 'wlbi' | 'aoi';

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

/**
 * The path of the folder should be relative to the root path.
 */
export interface Folder {
    id: string;
    path: string;           // NOTE: RELATIVE PATH
    type: DataSourceType;

    info?: FileInfo;
    error: boolean;
}

// TAURI INTERFACES

export interface FolderResult {
    path: string;
    exists: boolean;
    info?: FileInfo
}
// #[derive(Debug, Serialize)]
// pub struct FileInfo {
//     #[allow(non_snake_case)]
//     pub isFile: bool,
//     #[allow(non_snake_case)]
//     pub isDirectory: bool,
//     #[allow(non_snake_case)]
//     pub isSymlink: bool,

//     pub size: u64,
//     pub mtime: Option<String>,
//     pub atime: Option<String>,
//     pub birthtime: Option<String>,

//     pub readonly: bool,
//     #[allow(non_snake_case)]
//     pub fileAttributes: Option<u32>, // Windows only, will be None

//     pub dev: Option<u64>,
//     pub ino: Option<u64>,
//     pub mode: Option<u32>,
//     pub nlink: Option<u64>,
//     pub uid: Option<u32>,
//     pub gid: Option<u32>,
//     pub rdev: Option<u64>,
//     pub blksize: Option<u64>,
//     pub blocks: Option<u64>,
// }