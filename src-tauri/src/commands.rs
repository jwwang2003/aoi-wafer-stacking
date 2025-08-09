use std::collections::HashMap;
use std::fs;

use crate::file::file_io::{build_file_info, FolderRequest, FolderResult};

// #[tauri::command]
// pub fn check_folder_exists(path: String) -> Result<bool, String> {
//     file::file_io::try_folder_exists(path).map_err(|e| e.to_string())
// }

#[tauri::command]
pub fn get_file_batch_stat(folders: Vec<FolderRequest>) -> Vec<FolderResult> {
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

// =============================================================================

use crate::parser::{
    parse_product_mapping_xls as do_parse_product_mapping_xls,
    parse_product_xls as do_parse_product_xls,
    parse_substrate_defect_xls as do_parse_substrate_defect_xls,
};

use crate::wafer::ds::{BinMapData, DefectRecord, HexMapData, MapData, ProductMappingRecord, ProductRecord, Wafer};

#[tauri::command]
/// Object key is the sheet name<br/>
/// Typescript eqv. Record<string, ProductMappingRecord[]>;
pub fn rust_parse_product_mapping_xls(
    path: String,
) -> Result<HashMap<String, Vec<ProductMappingRecord>>, String> {
    do_parse_product_mapping_xls(path)
}

#[tauri::command]
/// Object key is the sheet name<br/>
/// Typescript eqv. Record<string, ProductRecord[]>;
pub fn rust_parse_product_xls(path: String) -> Result<HashMap<String, Vec<ProductRecord>>, String> {
    do_parse_product_xls(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_substrate_defect_xls(
    path: String,
) -> Result<HashMap<String, Vec<DefectRecord>>, String> {
    do_parse_substrate_defect_xls(path)
}

// =============================================================================

use crate::parser:: {
    parse_wafer as do_parse_wafer,
    parse_wafer_bin as do_parse_wafer_bin,
    parse_wafer_map_data as do_parse_wafer_map_data,
};

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer(
    path: String,
) -> Result<Wafer, String> {
    do_parse_wafer(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer_bin(
    path: String,
) -> Result<BinMapData, String> {
    do_parse_wafer_bin(path)
}

#[tauri::command]
/// Typescript eqv. Record<string, DefectRecord[]>;
pub fn rust_parse_wafer_map_data(
    path: String,
) -> Result<MapData, String> {
    do_parse_wafer_map_data(path)
}

//

#[tauri::command]
pub fn rust_export_wafer(wafer: Wafer, output_path: String) -> Result<(), String> {
    fs::write(&output_path, wafer.to_string())
        .map_err(|e| format!("Failed to write wafer to file: {}", e))
}

#[tauri::command]
pub fn rust_print_wafer(wafer: Wafer) -> Result<(), String> {
    println!("{}", wafer.to_string());
    Ok(())
}

#[tauri::command]
pub fn rust_export_wafer_bin(wafer_bin: BinMapData, output_path: String) -> Result<(), String> {
    fs::write(&output_path, wafer_bin.to_string())
        .map_err(|e| format!("Failed to write bin map to file: {}", e))
}

#[tauri::command]
pub fn rust_print_wafer_bin(wafer_bin: BinMapData) -> Result<(), String> {
    println!("{}", wafer_bin.to_string());
    Ok(())
}

#[tauri::command]
pub fn rust_export_wafer_map_data(data: MapData, output_path: String) -> Result<(), String> {
    fs::write(&output_path, data.to_string())
        .map_err(|e| format!("Failed to write map data to file: {}", e))
}

#[tauri::command]
pub fn rust_print_wafer_map_data(data: MapData) -> Result<(), String> {
    println!("{}", data.to_string());
    Ok(())
}

// HEX/.sinf

#[tauri::command]
pub fn rust_export_wafer_hex(wafer_hex: HexMapData, output_path: String) -> Result<(), String> {
    fs::write(&output_path, wafer_hex.to_string())
        .map_err(|e| format!("Failed to write map data to file: {}", e))
}

#[tauri::command]
pub fn rust_print_wafer_hex(wafer_hex: HexMapData) -> Result<(), String> {
    println!("{}", wafer_hex.to_string());
    Ok(())
}
