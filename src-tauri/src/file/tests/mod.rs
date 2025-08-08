#[test]
fn read_txt_unix_newlines() {
    use super::read_txt;
    use std::path::PathBuf;
    use std::{env, fs};
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_txt_unix.txt");
    fs::write(&path, "line1\nline2\n").expect("failed to write temp file");
    let lines = read_txt(path.to_str().unwrap()).expect("read_txt failed");
    assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
}

#[test]
fn read_txt_windows_newlines() {
    use super::read_txt;
    use std::path::PathBuf;
    use std::{env, fs};
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_txt_win.txt");
    fs::write(&path, "line1\r\nline2\r\n").expect("failed to write temp file");
    let lines = read_txt(path.to_str().unwrap()).expect("read_txt failed");
    assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
}

#[test]
fn read_txt_not_found() {
    use super::read_txt;
    use std::io::ErrorKind;
    let result = read_txt("nonexistent_file.txt");
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::NotFound);
}

#[test]
fn read_xls_not_found() {
    use super::read_xls;
    use std::io::ErrorKind;
    let result = read_xls("nonexistent.xls");
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::NotFound);
}

#[test]
fn read_xls_invalid_format() {
    use super::read_xls;
    use std::io::ErrorKind;
    use std::path::PathBuf;
    use std::{env, fs};
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_xls_invalid.xls");
    fs::write(&path, "not a valid xls content").expect("failed to write invalid xls");
    let result = read_xls(path.to_str().unwrap());
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::InvalidData);
}

// =============================================================================
// Real tests for reading .txt, .xls, and .WaferMap files

#[test]
fn read_txt_valid_file() {
    use super::read_txt;
    // Assuming that the CWD is src-tauri
    let path: &str = "static/S1M032120B_B003332_01_mapEx.txt";
    let result = read_txt(path);
    // Check if the .txt file was read successfully
    assert!(result.is_ok());
    let lines = result.unwrap();
    // Check if the file contains the expected number of lines
    assert!(!lines.is_empty(), "File should not be empty");
}

#[test]
fn read_xls_valid_defect_list() {
    use super::read_xls;
    use calamine::Reader;
    // Assuming that the CWD is src-tauri
    let path: &str = "static/86107919CNF1.xls";
    let result = read_xls(path);
    // Check if the .xls file was read successfully
    assert!(result.is_ok());

    let mut workbook = result.unwrap();

    // Check if the specific worksheet "Surface defect list" exists
    assert!(
        workbook.worksheet_range("Surface defect list").is_ok(),
        "Workbook should not be empty (Surface defect list)"
    );

    assert!(
        workbook.worksheet_range("PL defect list").is_ok(),
        "Workbook should not be empty (PL defect list)"
    );
}
