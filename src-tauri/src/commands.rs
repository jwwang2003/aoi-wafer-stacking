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

use crate::wafer::ds::{DefectRecord, ProductMappingRecord, ProductRecord};

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
