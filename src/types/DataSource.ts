// Note that these paths are all relative to the root folder
export interface PathsState {
    SubstratePaths: string[];
    CpProberPaths: string[];
    WlbiPaths: string[];
    AoiPaths: string[];
    lastModified: string;
}

export interface RegexState {
    SubstrateRegex: string;
    CpProberRegex: string;
    WlbiRegex: string;
    AoiRegex: string;
    lastModified: string;
}

// Main data structure to presist data source paths config
export interface ConfigState {
    rootPath: string;
    rootLastModified: string;
    paths: PathsState;
    regex: RegexState;
    lastSaved: string;
}

export type FolderGroups = {
    substrate: SubstrateFolder[];
    cpProbers: CpProberFolder[];
    wlbis: WlbiFolder[];
    aois: AoiFolder[];
};

// TODO: Add support for 'fab-cp' paths
export type DataSourceType =
    "substrate" | "fab-cp" | "cp-prober" | "wlbi" | "aoi";

export type Folder = {
    type: DataSourceType;
    name: string;
    id: string;
}

export interface SubstrateFolder extends Folder {
    type: 'substrate';
    name: 'Substrate'; // fixed name
    id: 'substrate';
}

export interface CpProberFolder extends Folder {
    type: 'cp-prober';
    name: string;       // e.g. "CP-prober-01"
    id: string;         // e.g. "01"
}

export interface WlbiFolder extends Folder {
    type: 'wlbi';
    name: string;       // e.g. "WLBI-B2"
    id: string;         // e.g. "B2"
}

export interface AoiFolder extends Folder {
    type: 'aoi';
    name: string;       // e.g. "AOI-03"
    id: string;         // e.g. "03"
}