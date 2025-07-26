use std::collections::HashMap;
use std::fs::{File};
use std::sync::Mutex;

use fs2::FileExt;
use once_cell::sync::Lazy;

/// A globally shared map storing file handles for all currently locked files.
///
/// This map is protected by a `Mutex` to ensure thread safety and is lazily
/// initialized using `once_cell::sync::Lazy`. It allows the application to
/// keep track of locked files and ensures the file handles remain in scope
/// (preventing premature unlocking).
static FILE_LOCKS: Lazy<Mutex<HashMap<String, File>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Acquires an exclusive lock on the specified file and stores the handle in the global lock map.
///
/// This command is exposed to the Tauri frontend via `invoke('lock_file')`.
/// If the file does not exist, it will be created. The file is opened with
/// read and write permissions, and the lock is held until it is explicitly
/// released or the application shuts down.
///
/// # Arguments
/// * `path` - The absolute path to the file to be locked.
///
/// # Errors
/// Returns a `String` error if the file cannot be opened or if the lock cannot be acquired.
#[tauri::command]
pub async fn lock_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(&path)
            .map_err(|e| format!("Failed to open file: {e}"))?;

        fs2::FileExt::lock_exclusive(&file)
            .map_err(|e| format!("Failed to lock file: {e}"))?;

        // ✅ Debug message
        // println!("✅ [lock_file] Successfully acquired lock for: {}", path);

        let mut map = FILE_LOCKS.lock().unwrap();
        map.insert(path, file);
        Ok(())
    })
    .await
    .unwrap_or_else(|e| Err(format!("Thread join error: {e}")))
}

/// Releases the lock on a previously locked file and removes it from the global lock map.
///
/// This command is exposed to the Tauri frontend via `invoke('unlock_file')`.
/// It attempts to unlock the file associated with the provided path and
/// deletes the corresponding file handle from the internal tracking map.
///
/// # Arguments
/// * `path` - The absolute path to the file to be unlocked.
///
/// # Errors
/// Returns a `String` error if the file is not found in the lock map or if unlocking fails.
#[tauri::command]
pub fn unlock_file(path: String) -> Result<(), String> {
    let mut map = FILE_LOCKS.lock().unwrap();

    if let Some(file) = map.remove(&path) {
        FileExt::unlock(&file)
            .map_err(|e| format!("Failed to unlock file: {e}"))?;
        Ok(())
    } else {
        Err("No lock found for the specified path".into())
    }
}

/// Releases all currently held file locks and clears the internal lock map.
///
/// This function is intended to be called during application shutdown
/// (e.g., via `tauri::Builder::on_exit`) to ensure that any files locked
/// during the application's lifetime are properly unlocked.
///
/// If unlocking a file fails, a warning will be printed to `stderr`.
/// All file handles are removed from the global lock store regardless.
pub fn clear_all_locks() {
    let mut map = FILE_LOCKS.lock().unwrap();

    for (path, file) in map.drain() {
        if let Err(e) = fs2::FileExt::unlock(&file) {
            eprintln!("Warning: Failed to unlock file '{}': {}", path, e);
        }
    }
}