use sha1::{Sha1, Digest as Sha1Digest};
use sha2::{Sha256};
use hex;
use tauri::command;

/// Hash a string with SHA1
#[command]
pub fn sha1_hash(input: String) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}

/// Hash a string with SHA256
#[command]
pub fn sha256_hash(input: String) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    hex::encode(result)
}