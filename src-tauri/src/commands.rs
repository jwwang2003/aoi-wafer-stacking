use std::fs;

use crate::file_handler;
use crate::file_handler::file_io::{build_file_info, FolderRequest, FolderResult};

#[tauri::command]
pub fn check_folder_exists(path: String) -> Result<bool, String> {
    file_handler::file_io::try_folder_exists(path).map_err(|e| e.to_string())
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