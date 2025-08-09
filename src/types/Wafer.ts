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
 * Data read from the OEM product to in-house product ID mapping
 */
export interface ProductMappingRecord {
    oemId: string,          // FAB Product ID
    productId: string       // FAB Product ID
}

/**
 * Data read from the product .xls file
 */
export interface ProductRecord {
    productId: string;      // Product ID
    batchId: string;        // Lot ID
    waferId: string;        // Wafer ID

    subId: string;          // Sub ID
}

/**
 * Data read from the substrate defect .xls file
 */
export interface SubstrateDefectRecord {
    no: number;             // No.
    x: number;              // X(mm)
    y: number;              // Y(mm)
    w: number;              // W(um)
    h: number;              // H(um)
    area: number;           // Area (um2)
    class: string;          // Class
    contrast: number;       // Contrast
    channel: string;        // Channel
}

// Return shapes of the data source EXCEL commands
export type ProductMappingXlsResult = Record<string, ProductMappingRecord[]>;
export type ProductXlsResult = Record<string, ProductRecord[]>;
export type SubstrateDefectXlsResult = Record<string, SubstrateDefectRecord[]>;

// =============================================================================

/**
 * For storing FAB CP, CP-prober, and AOI
 * NOTE:
 * - FAB CP uses '*' for alignment
 * - CP-prober and AOI uses a special character 'S' for alignment
 * - These are the only times a non-numerical number should appear in the data,
 *      the actual bins should all be numbers.
 */

// Primitives / enums

/** Rust: enum BinValue { Number(i32), Special(char) }
 *  Serde → { "number": 1 } | { "special": "S" }
 */
export type BinValue =
    | { number: number }   // numeric bin
    | { special: string }; // single-char like "S" or "*"

// ASCII map (shared)
export interface AsciiDie {
    x: number;      // i32
    y: number;      // i32
    bin: BinValue;  // number OR special marker (S, *)
}

/** Holds both raw rows and parsed dies (fields may be omitted when empty) */
export interface AsciiMap {
    raw?: string[];    // original ASCII lines
    dies?: AsciiDie[]; // parsed from raw
}

// FAB CP wafer (Wafer)
export interface Wafer {
    operator: string;
    device: string;
    lotId: string;
    waferId: string;
    measTime: string;   // string per Rust
    grossDie: number;   // u32
    passDie: number;    // u32
    failDie: number;    // u32
    totalYield: number; // f64 (e.g., 94.69)
    notch: string;      // e.g., "Down"
    map: AsciiMap;      // raw + dies
}

// CP-prober / AOI (MapData)

export interface MapData {
    deviceName: string;
    lotNo: string;
    waferId: string;
    waferSize: string;   // Rust keeps as string, e.g. `6"`
    diceSizeX: number;   // f64
    diceSizeY: number;   // f64
    flatNotch: string;

    mapColumns: number;  // u32
    mapRows: number;     // u32

    totalTested: number; // u32
    totalPass: number;   // u32
    totalFail: number;   // u32
    yieldPercent: number;// f64

    map: AsciiMap;       // raw + dies
}

// WLBI wafer map (BinMapData)

/** Rust: WaferMapDie (used in BinMapData.map) */
export interface WaferMapDie {
    x: number;         // i32
    y: number;         // i32
    bin: BinValue;     // typically { number: n } in this format
    reserved: number;  // i32
}

export interface BinCountEntry {
    bin: number;   // u32
    count: number; // u32
}

export interface BinMapData {
    waferType: number;  // u32
    dut: number;        // u32
    mode: number;       // u32
    product: string;
    waferLots: string;
    waferNo: string;    // Rust is String (not number)
    waferSize: number;  // f64

    indexX: number;     // f64
    indexY: number;     // f64

    map: WaferMapDie[];     // numeric die list
    bins: BinCountEntry[];  // sorted vector (not a map)
}

// Type guards (handy)

export const isNumberBin = (b: BinValue): b is { number: number } =>
    (b as any).number !== undefined;

export const isSpecialBin = (b: BinValue): b is { special: string } =>
    (b as any).special !== undefined;