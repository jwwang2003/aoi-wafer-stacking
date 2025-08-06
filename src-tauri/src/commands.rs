use std::fs;

use crate::file;
use crate::file::file_io::{build_file_info, FolderRequest, FolderResult};

use crate::crypto;

#[tauri::command]
pub fn check_folder_exists(path: String) -> Result<bool, String> {
    file::file_io::try_folder_exists(path).map_err(|e| e.to_string())
}

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

#[tauri::command]
pub fn rust_sha1(input: String) -> String {
    crypto::sha1_hash(input)
}

#[tauri::command]
pub fn rust_sha256(input: String) -> String {
    crypto::sha256_hash(input)
}