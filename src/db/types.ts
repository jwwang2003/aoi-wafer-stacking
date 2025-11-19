// The following file contains the respective helper data structures that we
// expect to be returned from a query for each row of data. We can do this because
// of how structured SQL databases are.

export type FileIndexRow = {
    file_path: string;     // absolute path
    last_mtime: number;    // epoch millis
    file_hash?: string | null;
};

export type FolderIndexRow = {
    folder_path: string;   // absolute path
    last_mtime: number;    // epoch millis
};

/** Row shape for product_size */
export type ProductSize = {
    oem_product_id: string;
    die_x: number;
    die_y: number;
};

/** Quick-lookup map: id -> { die_x, die_y } */
export type ProductSizeMap = Map<string, { die_x: number; die_y: number }>;

export type OemMapping = { oem_product_id: string; product_id: string };

export interface OemProductMapRow {
    oem_product_id: string;
    product_id: string;
}

export interface OemProductOffset {
    oem_product_id: string;
    x_offset: number;
    y_offset: number;
    defect_offset_x: number;
    defect_offset_y: number;
}

export type OemProductOffsetMap = Map<string, { x_offset: number; y_offset: number, defect_offset_x: number; defect_offset_y: number; }>;

export function applyOemOffset(
    x: number,
    y: number,
    offset?: Pick<OemProductOffset, 'x_offset' | 'y_offset'>
): { x: number; y: number } {
    if (!offset) return { x, y };
    return { x: x + offset.x_offset, y: y + offset.y_offset };
}


export interface ProductDefectMapRow {
    oem_product_id: string;
    lot_id: string;
    wafer_id: string;
    sub_id: string;
    file_path: string;
}

export interface SubstrateDefectRow {
    sub_id: string;
    file_path: string;
}

export interface WaferMapRow {
    idx?: number;              // NEW: auto-increment PK
    product_id: string;
    batch_id: string;
    wafer_id: number;          // INTEGER in DB
    stage: string;             // NOT NULL
    sub_stage: string | null;  // nullable
    retest_count: number;      // defaults to 0
    time: number | null;       // epoch ms (nullable)
    file_path: string;         // NOT NULL
}
