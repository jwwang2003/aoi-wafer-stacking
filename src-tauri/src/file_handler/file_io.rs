use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, Metadata};
use std::io::Result;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Try to check if a folder exists with detailed error support
pub fn try_folder_exists<P: AsRef<Path>>(path: P) -> Result<bool> {
    match fs::metadata(path) {
        Ok(metadata) => Ok(metadata.is_dir()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

#[derive(Debug, Deserialize)]
pub struct FolderRequest {
    pub path: String,
}

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

#[derive(Debug, Serialize)]
pub struct FolderResult {
    pub path: String,
    pub exists: bool,
    pub info: Option<FileInfo>,
}

#[derive(Debug, Serialize)]
pub struct FileInfo {
    #[allow(non_snake_case)]
    pub isFile: bool,
    #[allow(non_snake_case)]
    pub isDirectory: bool,
    #[allow(non_snake_case)]
    pub isSymlink: bool,

    pub size: u64,
    pub mtime: Option<String>,
    pub atime: Option<String>,
    pub birthtime: Option<String>,

    pub readonly: bool,
    #[allow(non_snake_case)]
    pub fileAttributes: Option<u32>, // Windows only, will be None

    pub dev: Option<u64>,
    pub ino: Option<u64>,
    pub mode: Option<u32>,
    pub nlink: Option<u64>,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub rdev: Option<u64>,
    pub blksize: Option<u64>,
    pub blocks: Option<u64>,
}

pub fn get_iso_time(time: std::io::Result<SystemTime>) -> Option<String> {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|dur| {
            // TODO: Probably should look into these later, but it probably won't
            // affect the usage of the program at this point in time.
            #[allow(deprecated)]
            let naive = NaiveDateTime::from_timestamp(dur.as_secs() as i64, 0);
            #[allow(deprecated)]
            DateTime::<Utc>::from_utc(naive, Utc).to_rfc3339()
        })
}

pub fn build_file_info(meta: &Metadata, _path: &str) -> FileInfo {
    FileInfo {
        isFile: meta.is_file(),
        isDirectory: meta.is_dir(),
        isSymlink: meta.file_type().is_symlink(),

        size: meta.len(),
        mtime: get_iso_time(meta.modified()),
        atime: get_iso_time(meta.accessed()),
        birthtime: get_iso_time(meta.created()),

        readonly: meta.permissions().readonly(),
        fileAttributes: None, // Not available on Unix, fallback to null on all platforms

        #[cfg(unix)]
        dev: Some(meta.dev()),
        #[cfg(not(unix))]
        dev: None,

        #[cfg(unix)]
        ino: Some(meta.ino()),
        #[cfg(not(unix))]
        ino: None,

        #[cfg(unix)]
        mode: Some(meta.mode()),
        #[cfg(not(unix))]
        mode: None,

        #[cfg(unix)]
        nlink: Some(meta.nlink()),
        #[cfg(not(unix))]
        nlink: None,

        #[cfg(unix)]
        uid: Some(meta.uid()),
        #[cfg(not(unix))]
        uid: None,

        #[cfg(unix)]
        gid: Some(meta.gid()),
        #[cfg(not(unix))]
        gid: None,

        #[cfg(unix)]
        rdev: Some(meta.rdev()),
        #[cfg(not(unix))]
        rdev: None,

        #[cfg(unix)]
        blksize: Some(meta.blksize()),
        #[cfg(not(unix))]
        blksize: None,

        #[cfg(unix)]
        blocks: Some(meta.blocks()),
        #[cfg(not(unix))]
        blocks: None,
    }
}
