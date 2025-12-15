-- =======================================
-- Base Schema for Wafer Tracking v1
-- =======================================

-- OEM -> Internal Product Mapping
CREATE TABLE IF NOT EXISTS oem_product_map (
    oem_product_id TEXT PRIMARY KEY,            -- OEM product id
    product_id TEXT NOT NULL UNIQUE             -- internal product
);

-- Unique offsets for each product
CREATE TABLE IF NOT EXISTS product_offsets (
    oem_product_id TEXT PRIMARY KEY,
    
    x_offset DOUBLE NOT NULL,
    y_offset DOUBLE NOT NULL,
    defect_offset_x DOUBLE NOT NULL,
    defect_offset_y DOUBLE NOT NULL,

    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE
);

-- Each product has a unique die size
CREATE TABLE IF NOT EXISTS product_size (
    oem_product_id TEXT PRIMARY KEY,

    die_x DOUBLE NOT NULL,
    die_y DOUBLE NOT NULL,

    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_bin_selection (
    oem_product_id TEXT PRIMARY KEY,           
    selected_bin_ids TEXT NOT NULL DEFAULT '*',

    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE
);

-- Product Lot/Wafer -> SubID Defect Mapping
CREATE TABLE IF NOT EXISTS product_defect_map (
    oem_product_id TEXT NOT NULL,
    lot_id TEXT NOT NULL,
    wafer_id TEXT NOT NULL,
    sub_id TEXT NOT NULL UNIQUE,

    file_path TEXT NOT NULL,

    PRIMARY KEY (oem_product_id, lot_id, wafer_id),
    FOREIGN KEY (oem_product_id) REFERENCES oem_product_map(oem_product_id) ON DELETE CASCADE,

    FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

-- Substrate Defect Files (referenced by sub_id)
CREATE TABLE IF NOT EXISTS substrate_defect (
    sub_id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL, -- relative to root folder

    FOREIGN KEY (sub_id) REFERENCES product_defect_map(sub_id) ON DELETE CASCADE

    -- substrate defect map (sub_id) will get removed when file_index gets removed
    FOREIGN KEY (file_path) REFERENCES file_index(file_path) ON DELETE CASCADE
);

-- Wafer Map Files (FAB CP, CP-Prober, WLBI, AOI)
CREATE TABLE IF NOT EXISTS wafer_maps (
    idx INTEGER PRIMARY KEY AUTOINCREMENT,

    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    wafer_id INTEGER NOT NULL,

    stage TEXT NOT NULL,                        -- e.g. CP = 0, WLBI , AOI
    sub_stage TEXT,                             -- optional: e.g. substage 2

    retest_count INTEGER DEFAULT 0,
    time INTEGER,                               -- epoch ms (nullable OK)

    file_path TEXT NOT NULL UNIQUE,

    -- Keep a FK to product catalog; your oem_product_map.product_id is UNIQUE
    FOREIGN KEY (product_id)
        REFERENCES oem_product_map(product_id) ON DELETE CASCADE,

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

DROP TABLE IF EXISTS wafer_stack_stats;

CREATE TABLE IF NOT EXISTS wafer_stack_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oem_product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    wafer_id TEXT NOT NULL,
    total_tested INTEGER NOT NULL,
    total_pass INTEGER NOT NULL,
    total_fail INTEGER NOT NULL,
    yield_percentage REAL NOT NULL,
    bin_counts TEXT NOT NULL DEFAULT '{}',
    start_time TEXT,
    stop_time TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(oem_product_id, batch_id, wafer_id)
);

-- =======================================
-- Indexes for Faster Lookup
-- =======================================

-- Find record based on the file_name
CREATE INDEX IF NOT EXISTS idx_product_defect_map_file_path
ON product_defect_map (file_path);

-- Find SubID by product, lot, wafer
CREATE INDEX IF NOT EXISTS idx_product_defect_map_product_lot_wafer
ON product_defect_map (oem_product_id, lot_id, wafer_id);

-- Lookup defect file by sub_id
CREATE INDEX IF NOT EXISTS idx_substrate_defect_path
ON substrate_defect (file_path);

CREATE INDEX IF NOT EXISTS idx_product_bin_selection_id
ON product_bin_selection (oem_product_id);

-- Lookup wafer maps by file path
CREATE INDEX IF NOT EXISTS idx_wafer_file_path
ON wafer_maps (file_path);

CREATE INDEX IF NOT EXISTS idx_wafer_stage
ON wafer_maps (stage);

CREATE INDEX IF NOT EXISTS idx_stage_product
ON wafer_maps (product_id);

CREATE INDEX IF NOT EXISTS idx_wafer_maps_natural
ON wafer_maps (product_id, batch_id, wafer_id);

CREATE INDEX IF NOT EXISTS idx_wafer_maps_time
ON wafer_maps (time);

CREATE INDEX IF NOT EXISTS idx_wafer_maps_stage
ON wafer_maps (stage, product_id);


CREATE INDEX IF NOT EXISTS idx_file_index_path
ON file_index (file_path);

CREATE INDEX IF NOT EXISTS idx_file_index_hash
ON file_index (file_hash);


CREATE INDEX IF NOT EXISTS idx_folder_index_path
ON folder_index (folder_path);

-- =======================================
-- User authentication
-- =======================================

-- Roles supported: 'admin' | 'user' | 'guest'
CREATE TABLE IF NOT EXISTS auth (
    username TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin','user','guest')),
    password TEXT,                   -- plaintext; NULL for guest
    created_at INTEGER NOT NULL DEFAULT (unixepoch('now')*1000)
    -- Optionally enforce guests have no password:
    , CHECK (role != 'guest' OR password IS NULL)
);

-- Seed users (idempotent). Change passwords as needed.
INSERT OR IGNORE INTO auth (username, role, password) VALUES
('admin', 'admin', 'admin'),
('guest', 'guest', NULL);

CREATE INDEX IF NOT EXISTS idx_auth_role ON auth (role);