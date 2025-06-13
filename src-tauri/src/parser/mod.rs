// src-tauri/src/parser.rs
mod test;

use serde::Serialize;
use std::fs;
use std::path::Path;
use thiserror::Error;

// Define error type
#[derive(Error, Debug)]
pub enum ParseError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Format(String),
}

// Structs for File1 metadata + map ASCII
#[derive(Serialize, Debug)]
pub struct WaferInfo {
    pub device_name: String,
    pub lot_no: String,
    pub wafer_id: String,
    pub wafer_size: String,
    pub dice_size_x: f64,
    pub dice_size_y: f64,
    pub flat_notch: String,
    pub map_columns: usize,
    pub map_rows: usize,
    pub total_tested: usize,
    pub total_pass: usize,
    pub total_fail: usize,
    pub yield_percent: f64,
    pub ascii_map: Vec<String>,
}

// Structs for File3 waferMap
#[derive(Serialize, Debug)]
pub struct WaferMapEntry {
    pub x: i32,
    pub y: i32,
    pub code: u32,
    pub flag: u32,
}

#[derive(Serialize, Debug)]
pub struct WaferMap {
    pub wafer_type: u8,
    pub dut: u8,
    pub mode: u8,
    pub product: String,
    pub wafer_lots: String,
    pub wafer_no: u8,
    pub wafer_size: f64,
    pub index_x: f64,
    pub index_y: f64,
    pub entries: Vec<WaferMapEntry>,
    pub total_test_dies: usize,
    pub total_pass_dies: usize,
    pub bins: Vec<u32>,
}

/// Parse from a raw string (no I/O), File1 style
pub fn parse_file1_str(content: &str) -> Result<WaferInfo, ParseError> {
    let mut lines = content.lines();
    let mut info = WaferInfo {
        device_name: String::new(),
        lot_no: String::new(),
        wafer_id: String::new(),
        wafer_size: String::new(),
        dice_size_x: 0.0,
        dice_size_y: 0.0,
        flat_notch: String::new(),
        map_columns: 0,
        map_rows: 0,
        total_tested: 0,
        total_pass: 0,
        total_fail: 0,
        yield_percent: 0.0,
        ascii_map: Vec::new(),
    };
    // Parse header key: value lines
    for _ in 0..13 {
        if let Some(line) = lines.next() {
            let parts: Vec<_> = line.split(':').map(str::trim).collect();
            if parts.len() != 2 { continue; }
            match parts[0] {
                "Device Name" => info.device_name = parts[1].to_string(),
                "Lot No." => info.lot_no = parts[1].to_string(),
                "Wafer ID" => info.wafer_id = parts[1].to_string(),
                "Wafer Size" => info.wafer_size = parts[1].to_string(),
                "Dice SizeX" => info.dice_size_x = parts[1].parse().unwrap_or(0.0),
                "Dice SizeY" => info.dice_size_y = parts[1].parse().unwrap_or(0.0),
                "Flat/Notch" => info.flat_notch = parts[1].to_string(),
                "Map Column" => info.map_columns = parts[1].parse().unwrap_or(0),
                "Map Row" => info.map_rows = parts[1].parse().unwrap_or(0),
                "Total Tested" => info.total_tested = parts[1].parse().unwrap_or(0),
                "Total Pass" => info.total_pass = parts[1].parse().unwrap_or(0),
                "Total Fail" => info.total_fail = parts[1].parse().unwrap_or(0),
                "Yield" => info.yield_percent = parts[1].trim_end_matches('%').parse().unwrap_or(0.0),
                _ => {}
            }
        }
    }
        // Remaining lines are ASCII map (skip blank lines)
    info.ascii_map = lines
        .filter(|l| !l.trim().is_empty())
        .map(str::to_string)
        .collect();
    Ok(info)
}

/// Parse from a raw string (no I/O), File3 style
pub fn parse_file3_str(content: &str) -> Result<WaferMap, ParseError> {
    let mut section = "header";
    let mut map = WaferMap {
        wafer_type: 0,
        dut: 0,
        mode: 0,
        product: String::new(),
        wafer_lots: String::new(),
        wafer_no: 0,
        wafer_size: 0.0,
        index_x: 0.0,
        index_y: 0.0,
        entries: Vec::new(),
        total_test_dies: 0,
        total_pass_dies: 0,
        bins: Vec::new(),
    };
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("[MAP]") {
            section = "map";
            continue;
        }
        if section == "header" {
            if let Some((key, val)) = line.split_once(':') {
                let v = val.trim();
                match key {
                    "WaferType" => map.wafer_type = v.parse().unwrap_or(0),
                    "DUT" => map.dut = v.parse().unwrap_or(0),
                    "Mode" => map.mode = v.parse().unwrap_or(0),
                    "Product" => map.product = v.to_string(),
                    "Wafer Lots" => map.wafer_lots = v.to_string(),
                    "Wafer No" => map.wafer_no = v.parse().unwrap_or(0),
                    "Wafer Size" => map.wafer_size = v.parse().unwrap_or(0.0),
                    "Index X" => map.index_x = v.parse().unwrap_or(0.0),
                    "Index Y" => map.index_y = v.parse().unwrap_or(0.0),
                    _ => {}
                }
            }
        } else if section == "map" && !line.is_empty() {
            let parts: Vec<_> = line.split_whitespace().collect();
            if parts.len() == 4 {
                map.entries.push(WaferMapEntry {
                    x: parts[0].parse().unwrap_or(0),
                    y: parts[1].parse().unwrap_or(0),
                    code: parts[2].parse().unwrap_or(0),
                    flag: parts[3].parse().unwrap_or(0),
                });
            }
        }
    }
    Ok(map)
}

// Generic read-and-parse functions
pub fn parse_file1<P: AsRef<Path>>(path: P) -> Result<WaferInfo, ParseError> {
    let content = fs::read_to_string(path)?;
    parse_file1_str(&content)
}

pub fn parse_file3<P: AsRef<Path>>(path: P) -> Result<WaferMap, ParseError> {
    let content = fs::read_to_string(path)?;
    parse_file3_str(&content)
}

// Tauri commands
#[tauri::command]
pub fn load_wafer_info(path: String) -> Result<WaferInfo, String> {
    parse_file1(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_wafer_map(path: String) -> Result<WaferMap, String> {
    parse_file3(path).map_err(|e| e.to_string())
}
