////////////////////////////////////////////////////////////////////////////////
// NOTE: Tauri IPC
////////////////////////////////////////////////////////////////////////////////

// Mirror of Rust's src-tauri/src/file/file_io.rs::FileInfo (camelCase, epoch ms)
export interface FileInfo {
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;

    size: number;
    mtime: number | null;
    atime: number | null;
    birthtime: string | null;

    readonly: boolean;
    fileAttributes: number | null;

    dev: number | null;
    ino: number | null;
    mode: number | null;
    nlink: number | null;
    uid: number | null;
    gid: number | null;
    rdev: number | null;
    blksize: number | null;
    blocks: number | null;
}

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
export interface DieLayoutSheet {
    xHeaders: number[];
    yHeaders: number[];
    dies: AsciiDie[];
}
export type DieLayoutMap = Record<string, DieLayoutSheet>;

// =============================================================================

/**
 * For storing FAB CP, CP-prober, and AOI
 * NOTE:
 * - FAB CP uses "*" for alignment
 * - CP-prober and AOI uses a special character "S" for alignment
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b as any).number !== undefined;

export const isSpecialBin = (b: BinValue): b is { special: string } =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b as any).special !== undefined;

// NOTE: HEX/.sinf

/**
 * Rust: `pub struct HexCell(pub Option<u8>);`
 * Serde newtype → JSON is just the inner value:
 *   Some(0x03) → 3
 *   None       → null   (represents `--`)
 */
export type HexCell = number | null;

/**
 * Carries the raw RowData lines, parsed grid, and flattened dies.
 * `raw` / `dies` are optional because Rust uses `skip_serializing_if = "Vec::is_empty"`.
 */
export interface HexMap {
    raw?: string[];           // exact text after "RowData:" (one per row)
    grid: HexCell[][];        // [row][col] numbers or nulls (for `--`)
    dies?: AsciiDie[];        // centered (x,y) with numeric bins
}

/** Header block (all camelCase to match Serde rename_all) */
export interface HexHeader {
    device: string;           // DEVICE
    lot: string;              // LOT
    wafer: string;            // WAFER
    fnloc?: number;           // FNLOC (optional)
    rowCt: number;            // ROWCT
    colCt: number;            // COLCT
    bcequ?: number;           // BCEQU (optional)
    refpx: number;            // REFPX
    refpy: number;            // REFPY
    dutMs: string;            // DUTMS (e.g., "MM")
    xDies: number;            // XDIES
    yDies: number;            // YDIES
}

/** Top-level container returned by the Tauri command */
export interface HexMapData {
    header: HexHeader;
    map: HexMap;
}

// =============================================================================
// NOTE: TAURI INTERFACES
// =============================================================================

/**
 * Result of querying a filesystem entry (folder or file).
 *
 * - `path` is the absolute filesystem path that was checked.
 * - `exists` indicates whether the entry existed at the time of the stat.
 * - `info` is present only when the entry exists and metadata could be read (FileInfo).
 * 
 * For FileInfo:
 *
 * ⚠️ Time fields:
 * - `mtime` and `atime` are **Numbers (epoch milliseconds)**, compatible with
 *   JavaScript’s `Date#getTime()`. They are **not** `Date` objects.
 *   Convert with `new Date(info.mtime)` if you need a `Date`.
 * - `birthtime` (if present) is an ISO 8601 string.
 *
 * Notes:
 * - `isFile` / `isDirectory` / `isSymlink` are mutually exclusive flags from the stat result.
 * - Some low-level fields are platform-dependent and may be `null`.
 * - On Windows, `fileAttributes` may be set; it’s `null` on other platforms.
 */
export interface DirResult {
    path: string;
    exists: boolean;
    info?: FileInfo
}

// =============================================================================
// AOI inference

export interface AoiWeightStatus {
    cpuPath?: string;
    gpuPath?: string;
    available: AoiWeightInfo[];
}

export interface AoiWeightInfo {
    model: string;
    device: string;
    format: string;
    path: string;
    extension: string;
}

export interface AoiDeviceStatus {
    gpuAvailable: boolean;
    gpuCount: number;
    preferGpu: boolean;
}

export interface AoiInferenceStatus {
    device: AoiDeviceStatus;
    weights: AoiWeightStatus;
    libtorchEnabled: boolean;
}

export interface AoiInferencePreview {
    values: number[];
    totalValues: number;
    shape: number[];
}

export interface AoiInferenceSample {
    name: string;
    durationMs: number;
    width: number;
    height: number;
    channels: number;
    device: string;
    preview: AoiInferencePreview;
    mask?: {
        width: number;
        height: number;
        data: number[];
    };
    detection?: AoiDetectionResult;
}

export interface AoiInferenceError {
    name: string;
    message: string;
}

export interface AoiInferenceBackend {
    device: string;
    gpu: boolean;
    gpuCount: number;
    modelPath: string;
    weights: AoiWeightStatus;
}

export interface AoiInferenceBatchResult {
    backend: AoiInferenceBackend;
    results: AoiInferenceSample[];
    errors: AoiInferenceError[];
}

export interface AoiResizeConfig {
    width: number;
    height: number;
}

export interface AoiMaskConfig {
    threshold?: number;
}

export interface AoiDetectionBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    score: number;
    classId: number;
}

export interface AoiDetectionResult {
    modelPath: string;
    device: string;
    inputShape: number[];
    pad: number[];
    boxes: AoiDetectionBox[];
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
//     pub mtime: Option<f64>,
//     pub atime: Option<f64>,
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
