mod tests;

use std::fs::{metadata, File};
use std::io::{self, BufRead, BufReader, Error, ErrorKind};
use calamine::{open_workbook, Xls};

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
///
/// # Examples
///
/// ```no_run
/// # use std::io;
/// # fn main() -> io::Result<()> {
/// let lines = your_crate::read_txt("data/config.txt")?;
/// for (i, line) in lines.iter().enumerate() {
///     println!("{}: {}", i + 1, line);
/// }
/// # Ok(()) }
/// ```
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
///
/// # Examples
///
/// ```no_run
/// # use std::io;
/// # fn main() -> io::Result<()> {
/// let mut workbook = your_crate::read_xls("1-86107919CNF1.xls")?;
/// let range = workbook
///     .worksheet_range("Surface defect list")?
///     .expect("Worksheet not found");
/// // … deserialize or iterate over `range` …
/// # Ok(()) }
/// ```
pub fn read_xls(path: &str) -> io::Result<Xls<BufReader<File>>> {
    // Ensure the file exists before handing off to calamine
    if metadata(path).is_err() {
        return Err(Error::new(ErrorKind::NotFound, format!("File not found: {}", path)));
    }

    // Open the workbook; map any calamine error into an InvalidData io::Error
    let workbook: Xls<BufReader<File>> = open_workbook(path)
        .map_err(|e| Error::new(ErrorKind::InvalidData, format!("Failed to open XLS: {}", e)))?;

    Ok(workbook)
}
