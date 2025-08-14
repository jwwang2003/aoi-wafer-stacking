// The following file contains the respective helper data structures that we
// expect to be returned from a query for each row of data. We can do this because
// of how structured SQL databases are.

export type FileIndexRow = {
    file_path: string;     // relative path
    last_mtime: number;    // epoch millis
    file_hash?: string | null;
};

export type FolderIndexRow = {
    folder_path: string;   // relative path
    last_mtime: number;    // epoch millis
};

export type OemMapping = { oem_product_id: string; product_id: string };

export interface OemProductMapRow {
    oem_product_id: string;
    product_id: string;
}

export interface ProductDefectMapRow {
    product_id: string;
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
    idx?: number;              // NEW: autoincrement PK
    product_id: string;
    batch_id: string;
    wafer_id: number;          // INTEGER in DB
    stage: string;             // NOT NULL
    sub_stage: string | null;  // nullable
    retest_count: number;      // defaults to 0
    time: number | null;       // epoch ms (nullable)
    file_path: string;         // NOT NULL
}