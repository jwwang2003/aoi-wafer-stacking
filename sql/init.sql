-- =======================================
-- Base Schema for Wafer Tracking v1
-- =======================================

-- OEM -> Internal Product Mapping
CREATE TABLE IF NOT EXISTS oem_product_map (
    oem_product_id TEXT PRIMARY KEY,    -- OEM product id
    product_id TEXT NOT NULL            -- internal product
);

-- Product Lot/Wafer -> SubID Defect Mapping
CREATE TABLE IF NOT EXISTS product_defect_map (
    product_id TEXT NOT NULL,
    lot_id TEXT NOT NULL,
    wafer_id TEXT NOT NULL,
    sub_id TEXT NOT NULL,

    file_path TEXT NOT NULL,

    PRIMARY KEY (product_id, lot_id, wafer_id),
    FOREIGN KEY (product_id) REFERENCES oem_product_map(product_id),
    FOREIGN KEY (sub_id) REFERENCES substrate_defect(sub_id),
    
    -- product defect map will get removed when file_index gets removed
    FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

-- Enforce that each sub_id is unique to one wafer
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_subid ON product_defect_map(sub_id);

-- Substrate Defect Files (referenced by sub_id)
CREATE TABLE IF NOT EXISTS substrate_defect (
    sub_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL -- relative to root folder

    -- substrate defect map (sub_id) will get removed when file_index gets removed
    FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

-- Wafer Map Files (FAB CP, CP-Prober, WLBI, AOI)
CREATE TABLE IF NOT EXISTS wafer_maps (
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    wafer_id INTEGER NOT NULL,

    stage TEXT NOT NULL,             -- e.g. CP, WLBI, AOI
    sub_stage TEXT,                  -- optional: e.g. substage 2

    retest_count INTEGER DEFAULT 0,
    time INTEGER,
    
    file_path TEXT NOT NULL,

    PRIMARY KEY (product_id, batch_id, wafer_id),
    FOREIGN KEY (product_id, batch_id, wafer_id)
        REFERENCES product_defect_map(product_id, lot_id, wafer_id)
        ON DELETE CASCADE
    
    -- wafer map entry will be removed when the file_index gets removed
    FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_index (
    file_path TEXT PRIMARY KEY,       -- Should be relative file path (relative to the root folder)
    last_mtime INTEGER NOT NULL,      -- From `metadata(filePath).modified`
    file_hash TEXT                    -- Optional: SHA-1, SHA-256, etc.
);

CREATE TABLE IF NOT EXISTS folder_index (
    folder_path TEXT PRIMARY KEY,
    last_mtime INTEGER
);

-- =======================================
-- Indexes for Faster Lookup
-- =======================================

-- Find record based on the file_name
CREATE INDEX IF NOT EXISTS idx_product_defect_map_file_path
ON product_defect_map (file_path);

-- Find SubID by product, lot, wafer
CREATE INDEX IF NOT EXISTS idx_product_defect_map_product_lot_wafer
ON product_defect_map (product_id, lot_id, wafer_id);

-- Lookup defect file by sub_id
CREATE INDEX IF NOT EXISTS idx_substrate_defect_path
ON substrate_defect (file_path);

-- Lookup wafer maps by file path
CREATE INDEX IF NOT EXISTS idx_wafer_file_path
ON wafer_maps (file_path);

-- Optional: search wafer maps by stage
CREATE INDEX IF NOT EXISTS idx_wafer_stage
ON wafer_maps (stage);


CREATE INDEX IF NOT EXISTS idx_file_index_path
ON file_index (file_path);

CREATE INDEX IF NOT EXISTS idx_file_index_hash
ON file_index (file_hash);


CREATE INDEX IF NOT EXISTS idx_folder_index_path
ON folder_index (folder_path);

CREATE INDEX IF NOT EXISTS idx_stage_product
ON wafer_maps (stage, product_id);