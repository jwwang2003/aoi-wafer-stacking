use std::{env, fs};
use std::io::ErrorKind;
use std::path::PathBuf;

// Replace `your_crate` with your actual crate name
use super::{read_txt, read_xls};

#[test]
fn read_txt_unix_newlines() {
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_txt_unix.txt");
    fs::write(&path, "line1\nline2\n").expect("failed to write temp file");
    let lines = read_txt(path.to_str().unwrap()).expect("read_txt failed");
    assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
}

#[test]
fn read_txt_windows_newlines() {
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_txt_win.txt");
    fs::write(&path, "line1\r\nline2\r\n").expect("failed to write temp file");
    let lines = read_txt(path.to_str().unwrap()).expect("read_txt failed");
    assert_eq!(lines, vec!["line1".to_string(), "line2".to_string()]);
}

#[test]
fn read_txt_not_found() {
    let result = read_txt("nonexistent_file.txt");
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::NotFound);
}

#[test]
fn read_xls_not_found() {
    let result = read_xls("nonexistent.xls");
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::NotFound);
}

#[test]
fn read_xls_invalid_format() {
    let mut path = PathBuf::from(env::temp_dir());
    path.push("read_xls_invalid.xls");
    fs::write(&path, "not a valid xls content").expect("failed to write invalid xls");
    let result = read_xls(path.to_str().unwrap());
    assert!(result.is_err());
    let err = result.err().unwrap();
    assert_eq!(err.kind(), ErrorKind::InvalidData);
}