mod tests;

pub mod file_io;
pub mod file_lock;

use calamine::{open_workbook, Xls};
use std::fs::{metadata, File};
use std::io::{self, BufRead, BufReader, Error, ErrorKind, Write};

/// Reads the given text file and returns all of its lines as a `Vec<String>`.
///
/// This function:
/// - Opens `path` as a UTF-8 text file.
/// - Reads it line by line, handling both Unix (`\n`) and Windows (`\r\n`) line endings.
/// - Trims any trailing `\r` on each line before collecting.
///
/// # Errors
///
/// - Returns an `io::ErrorKind::NotFound` if the file does not exist or cannot be opened.
/// - Returns other I/O errors if reading fails at any point.
pub fn read_txt(path: &str) -> io::Result<Vec<String>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);

    let mut lines = Vec::new();
    for line_result in reader.lines() {
        // Trim any stray '\r' from Windows CRLF endings
        let line = line_result?.trim_end_matches('\r').to_string();
        lines.push(line);
    }

    Ok(lines)
}

/// Writes any `data: &T` (where `T: Display`) to a file.
///
/// - `base_path` is the file path *without* suffix (e.g. `"output/wafer1"`).
/// - `suffix` is an optional extension like `".txt"` or `".WaferMap"`.  
///    If `None`, defaults to `".txt"`.  
///    If `base_path` already ends with that suffix, it won’t be duplicated.
///
/// # Errors
/// Returns any I/O error encountered when creating or writing the file.
pub fn write_to_file<T: std::fmt::Display>(
    data: &T,
    base_path: &str,
    suffix: Option<&str>,
) -> io::Result<()> {
    // decide on suffix
    let suffix = suffix.unwrap_or(".txt");
    // build the real path
    let mut path = String::from(base_path);
    if !path.ends_with(suffix) {
        path.push_str(suffix);
    }
    // create + write
    let mut file = File::create(&path)?;
    write!(file, "{}", data)?;
    Ok(())
}

/// Opens an Excel `.xls` workbook at `path` and returns the raw `Xls<BufReader<File>>`.
///
/// This function:
/// 1. Verifies that the file at `path` exists.
/// 2. Attempts to open it as an `.xls` workbook via the `calamine` crate.
///
/// You can then call methods like `.worksheet_range(...)` on the returned `Xls` to read sheets.
///
/// # Errors
///
/// - Returns `io::ErrorKind::NotFound` if the file does not exist.
/// - Returns `io::ErrorKind::InvalidData` if `calamine` fails to parse the file as a valid `.xls`.
pub fn read_xls(path: &str) -> io::Result<Xls<BufReader<File>>> {
    // Ensure the file exists before handing off to calamine
    if metadata(path).is_err() {
        return Err(Error::new(
            ErrorKind::NotFound,
            format!("File not found: {}", path),
        ));
    }

    // Open the workbook; map any calamine error into an InvalidData io::Error
    let workbook: Xls<BufReader<File>> = open_workbook(path)
        .map_err(|e| Error::new(ErrorKind::InvalidData, format!("Failed to open XLS: {}", e)))?;

    Ok(workbook)
}
