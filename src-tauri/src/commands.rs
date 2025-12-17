use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::file::file_io::{build_file_info, FolderRequest, FolderResult};

// #[tauri::command]
// pub fn check_folder_exists(path: String) -> Result<bool, String> {
//     file::file_io::try_folder_exists(path).map_err(|e| e.to_string())
// }

#[tauri::command]
pub fn rust_read_file_stat_batch(folders: Vec<FolderRequest>) -> Vec<FolderResult> {
    folders
        .into_iter()
        .map(|folder| {
            let path = folder.path.clone();
            match fs::metadata(&folder.path) {
                Ok(meta) => FolderResult {
                    path,
                    exists: true,
                    info: Some(build_file_info(&meta, &folder.path)),
                },
                Err(_) => FolderResult {
                    path,
                    exists: false,
                    info: None,
                },
            }
        })
        .collect()
}

/// Get metadata for all **direct subfolders** under the given folder.
#[tauri::command]
pub fn rust_read_dir(dir: String) -> Vec<FolderResult> {
    let mut out = Vec::new();
    let root = Path::new(&dir);

    // If root itself doesn't exist, return a single "not exists" record for clarity
    if !root.exists() {
        out.push(FolderResult {
            path: dir,
            exists: false,
            info: None,
        });
        return out;
    }

    // Read direct children and keep only directories
    match fs::read_dir(root) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let p = entry.path();
                let path_str = p.to_string_lossy().to_string();
                match fs::metadata(&p) {
                    Ok(meta) => out.push(FolderResult {
                        path: path_str,
                        exists: true,
                        info: Some(build_file_info(&meta, &p.to_string_lossy())),
                    }),
                    Err(_) => out.push(FolderResult {
                        path: path_str,
                        exists: false,
                        info: None,
                    }),
                }
            }
        }
        Err(_) => {
            // Could not read the directory; return the root as not accessible
            out.push(FolderResult {
                path: dir,
                exists: false,
                info: None,
            });
        }
    }

    out
}

// =============================================================================

use crate::crypto;

#[tauri::command]
pub fn rust_sha1(input: String) -> String {
    crypto::sha1_hash(input)
}

#[tauri::command]
pub fn rust_sha256(input: String) -> String {
    crypto::sha256_hash(input)
}

#[tauri::command]
pub fn rust_sha1_batch(inputs: Vec<String>) -> Vec<String> {
    inputs.into_iter().map(crypto::sha1_hash).collect()
}

// =============================================================================

use crate::parser::{
    debug_print_die_layout_coords, parse_die_layout_xls, parse_product_mapping_xls,
    parse_product_xls, parse_substrate_defect_xls, parse_wafer, parse_wafer_bin,
    parse_wafer_map_data, DieLayoutSheet,
};
use crate::inference;

use crate::wafer::ds::{
    BinMapData, DefectRecord, HexMapData, MapData, ProductMappingRecord, ProductRecord, Wafer,
};

#[tauri::command]
/// Object key is the sheet name<br/>
/// Typescript eqv. Record<string, ProductMappingRecord[]>;
pub fn rust_parse_product_mapping_xls(
    path: String,
) -> Result<HashMap<String, Vec<ProductMappingRecord>>, String> {
    parse_product_mapping_xls(path)
}

#[tauri::command]
/// Object key is the sheet name<br/>
/// Typescript eqv. Record<string, ProductRecord[]>;
pub fn rust_parse_product_xls(path: String) -> Result<HashMap<String, Vec<ProductRecord>>, String> {
    parse_product_xls(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_substrate_defect_xls(
    path: String,
) -> Result<HashMap<String, Vec<DefectRecord>>, String> {
    parse_substrate_defect_xls(path)
}

#[tauri::command]
/// Parse a substrate die layout Excel (sheet per product id; x/y headers + grid).
pub fn rust_parse_die_layout_xls(
    path: String,
) -> Result<HashMap<String, DieLayoutSheet>, String> {
    parse_die_layout_xls(path)
}

#[tauri::command]
pub fn rust_debug_print_die_layout_coords(path: String) -> Result<(), String> {
    debug_print_die_layout_coords(path)
}

// =============================================================================

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer(path: String) -> Result<Wafer, String> {
    parse_wafer(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer_bin(path: String) -> Result<BinMapData, String> {
    parse_wafer_bin(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer_map_data(path: String) -> Result<MapData, String> {
    parse_wafer_map_data(path)
}

fn export_bytes<L: AsRef<str>, D: Into<Vec<u8>>>(label: L, output_path: &str, data: D) -> Result<(), String> {
    fs::write(output_path, data.into())
        .map_err(|e| format!("Failed to write {} to file: {}", label.as_ref(), e))
}

fn print_value(content: String) -> Result<(), String> {
    println!("{}", content);
    Ok(())
}

#[tauri::command]
pub fn rust_export_wafer(wafer: Wafer, output_path: String) -> Result<(), String> {
    export_bytes("wafer", &output_path, wafer.to_string())
}

#[tauri::command]
pub fn rust_print_wafer(wafer: Wafer) -> Result<(), String> {
    print_value(wafer.to_string())
}

#[tauri::command]
pub fn rust_export_wafer_bin(wafer_bin: BinMapData, output_path: String) -> Result<(), String> {
    export_bytes("bin map", &output_path, wafer_bin.to_string())
}

#[tauri::command]
pub fn rust_print_wafer_bin(wafer_bin: BinMapData) -> Result<(), String> {
    print_value(wafer_bin.to_string())
}

#[tauri::command]
pub fn rust_export_wafer_map_data(data: MapData, output_path: String) -> Result<(), String> {
    export_bytes("map data", &output_path, data.to_string())
}

#[tauri::command]
pub fn rust_print_wafer_map_data(data: MapData) -> Result<(), String> {
    print_value(data.to_string())
}

// HEX/.sinf

#[tauri::command]
pub fn rust_export_wafer_hex(wafer_hex: HexMapData, output_path: String) -> Result<(), String> {
    export_bytes("map data", &output_path, wafer_hex.to_string())
}

#[tauri::command]
pub fn rust_print_wafer_hex(wafer_hex: HexMapData) -> Result<(), String> {
    print_value(wafer_hex.to_string())
}


#[tauri::command]
pub fn rust_export_wafer_jpg(image_data: Vec<u8>, output_path: String) -> Result<(), String> {
   export_bytes("image data", &output_path, image_data)
}

// =============================================================================
// AOI TorchScript inference

#[tauri::command]
pub fn rust_aoi_inference_status() -> inference::InferenceStatus {
    inference::inference_status()
}

#[tauri::command]
pub async fn rust_aoi_run_inference(
    req: inference::InferenceRequest,
) -> Result<inference::InferenceBatchResult, String> {
    tauri::async_runtime::spawn_blocking(move || inference::run_inference(req))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}
