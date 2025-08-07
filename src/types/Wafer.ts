import { DataSourceType, FolderResult } from './DataSource';

export const enum Direction {
    'Up',
    'Down',
    'Left',
    'Right'
}

export const enum DirectionAllCap {
    'UP',
    'DOWN',
    'LEFT',
    'RIGHT'
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Excel data
////////////////////////////////////////////////////////////////////////////////

export enum ExcelType {
    Mapping = 'Mapping',            // Product list (e.g., from OEM or internal record)
    Product = 'Product',            // Product metadata
    DefectList = 'DefectList',      // Defect sheet
}

/**
 * Metadata and context for an Excel file.
 */
export interface ExcelData {
    stage: DataSourceType;
    type: ExcelType;

    /** Optional extracted timestamp from filename or context (e.g., "20250709_120302") */
    id?: string;
    oem?: string;
    time?: string;      // timestamp from the filename

    /** Detailed file info from the filesystem */
    filePath: string;
    lastModified: number;
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Wafer Metadata
////////////////////////////////////////////////////////////////////////////////

/**
 * Metadata extracted from a wafer-related file path or filename.
 */
export interface WaferFileMetadata {
    // Required properties
    stage: DataSourceType,
    productModel: string;       // 产品型号
    batch: string;              // 批次
    waferId: string;            // 片号

    /** Optional processing sub-stage (e.g., 2 or 3), typically relevant to CP & WLBI stage only */
    retestCount?: number;
    processSubStage?: number;

    /** Optional extracted timestamp from file/folder name */
    time?: string;

    /** Full file path */
    filePath: string;
    lastModified: number;
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: WaferMetadata slice
////////////////////////////////////////////////////////////////////////////////

export type FolderCollection = { [K in DataSourceType]: FolderResult[] };
export type RawWaferMetadata = ExcelData | WaferFileMetadata;
export type RawWaferMetadataCollection = RawWaferMetadata[];

export interface WaferMetadataState {
    // data: {
    //     [K in DataSourceType]: RawWaferMetadata[];
    // };
    data: RawWaferMetadataCollection;
    lastSaved: string;
}

////////////////////////////////////////////////////////////////////////////////
// NOTE: Tauri IPC
////////////////////////////////////////////////////////////////////////////////

/**
 * Data read from the substrate .xls file
 */
export interface SubstrateDefectRecord {
    'No.': number;
    'X(mm)': number;
    'Y(mm)': number;
    'W(um)': number;
    'H(um)': number;
    'Area(um2)': number;
    Class: string;
    Contrast: number;
    Channel: string;
}

/**
 * For storing FAB CP, CP-prober, and AOI
 * NOTE:
 * - FAB CP uses '*' for alignment
 * - CP-prober and AOI uses a special character 'S' for alignment
 * - These are the only times a non-numerical number should appear in the data,
 *      the actual bins should all be numbers.
 */
export interface AsciiDie {
    x: number; // column index (e.g., 0 to 33 for 34 cols)
    y: number; // row index (e.g., 0 to 36 for 37 rows)
    bin: number | 'S' | '*'; // supports 'S' (special marker) or numeric bins
}

/**
 * For the generic CP-prober, AOI types
 */
export interface MapData {
    deviceName: string;
    lotNo: string;
    waferId: string;
    waferSizeInch: number;
    dieSizeX: number;
    dieSizeY: number;
    flatOrNotch: Direction | DirectionAllCap;
    mapColumns: number;
    mapRows: number;

    statistics: {
        totalTested: number;
        totalPassed: number;
        totalFailed: number;
        yield: number; // percentage, e.g., 95.40
    };

    // 2D map data extracted from ASCII
    map: AsciiDie[];
}

/**
 * For the FAB CP type (similar to MapData but not really)
 */
export interface BinMapData {
    operator: string;
    device: string;
    lotId: string;
    waferId: string;
    measurementTime: string; // ISO format date string
    notchDirection: Direction | DirectionAllCap;

    statistics: {
        grossDie: number;
        passDie: number;
        failDie: number;
        yield: number; // e.g., 95.71
    };

    map: AsciiDie[]; // flat list of dies with position and bin info
}


/**
 * For WaferMap, represents a single die on the wafer map
 */
export interface Die {
    // Example: -4 -18 257 0
    x: number;
    y: number;
    bin: number;
    reserved: number; // always 0 in your example
}

/**
 * For WaferMap, to collect bin statistics,
 * bin index to count mapping, at the very bottom of the .WaferMap file
 */
export type BinCounts = { [binNumber: number]: number };

/**
 * Complete WaferMap data
 */
export interface WaferMapData {
    waferType: number;
    dut: number;
    mode: number;
    product: string;
    waferLots: string;
    waferNo: number;
    waferSize: number;
    indexX: number;
    indexY: number;

    map: Die[];

    statistics: {
        totalDiesTested: number;
        totalDiesPassed: number;
        binCounts: BinCounts;
    };
}