mod tests;

use crate::wafer::ds::{AsciiDie, BinValue, DefectRecordExcel, ProductRecord, ProductRecordExcel};

use super::file::read_txt;
use super::wafer::ds::{BinMapData, DefectRecord, MapData, ProductMappingRecord, Wafer};
use calamine::Data;
use calamine::{open_workbook_auto, RangeDeserializerBuilder, DataType, Reader};
use std::io::{Read as IoRead, Seek};
use std::collections::{HashMap, HashSet};

fn sheet_range<R>(
    wb: &mut calamine::Sheets<R>,
    sheet: &str,
) -> Result<calamine::Range<Data>, String>
where
    R: IoRead + Seek,
{
    wb.worksheet_range(sheet)
        .map_err(|e| format!("Error reading sheet '{}': {}", sheet, e))
}

#[tauri::command]
pub fn parse_product_mapping_xls(
    path: String,
) -> Result<HashMap<String, Vec<ProductMappingRecord>>, String> {
    let mut wb =
        open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel '{}': {}", path, e))?;

    let mut result: HashMap<String, Vec<ProductMappingRecord>> = HashMap::new();

    for sheet in wb.sheet_names().to_owned() {
        let range = sheet_range(&mut wb, &sheet)?;

        let mut rows_for_sheet = Vec::new();

        // Skip header row; treat col0 -> oem_id, col1 -> product_id
        for row in range.rows().skip(1) {
            if row.len() < 2 {
                continue;
            }

            // Ignore rows where both are empty
            let oem_id = row[0].as_string().unwrap_or_default().trim().to_string();
            let product_id = row[1].as_string().unwrap_or_default().trim().to_string();
            if oem_id.is_empty() && product_id.is_empty() {
                continue;
            }

            rows_for_sheet.push(ProductMappingRecord { oem_id, product_id });
        }

        // Only insert sheets that produced rows
        if !rows_for_sheet.is_empty() {
            result.insert(sheet.clone(), rows_for_sheet);
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn parse_product_xls(path: String) -> Result<HashMap<String, Vec<ProductRecord>>, String> {
    let mut wb =
        open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel '{}': {}", path, e))?;

    let mut result: HashMap<String, Vec<ProductRecord>> = HashMap::new();
    let mut matched_any = false;

    for sheet in wb.sheet_names().to_owned() {
        let range = sheet_range(&mut wb, &sheet)?;

        // Try to deserialize using headers in the first row
        let iter = RangeDeserializerBuilder::new()
            .has_headers(true)
            .from_range::<_, ProductRecordExcel>(&range);

        let mut products = Vec::new();

        match iter {
            Ok(mut rows) => {
                while let Some(row) = rows.next() {
                    let excel_row: ProductRecordExcel =
                        row.map_err(|e| format!("Deserialization error in '{}': {}", sheet, e))?;
                    products.push(excel_row.into());
                }

                // Only insert sheets that actually produced rows
                if !products.is_empty() {
                    result.insert(sheet.clone(), products);
                    matched_any = true;
                }
            }
            Err(_) => {
                // This sheet likely doesn't have the required headers; skip it silently.
                continue;
            }
        }
    }

    if !matched_any {
        return Err("No sheets contained the required columns: 'Product ID', 'Lot ID', 'Wafer ID', 'Sub ID'.".into());
    }

    Ok(result)
}

/// Parse a defect list from an Excel file into a Vec<DefectRecord>.
#[tauri::command]
pub fn parse_substrate_defect_xls(
    path: String,
) -> Result<HashMap<String, Vec<DefectRecord>>, String> {
    let mut wb =
        open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel '{}': {}", path, e))?;

    let sheet_names: HashSet<_> = wb.sheet_names().iter().cloned().collect();
    let required = ["Surface defect list", "PL defect list"];
    let missing: Vec<_> = required
        .iter()
        .copied()
        .filter(|s| !sheet_names.contains(*s))
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "Workbook is missing required sheet(s): {}",
            missing.join(", ")
        ));
    }

    let mut result: HashMap<String, Vec<DefectRecord>> = HashMap::new();

    for &sheet in &required {
        let range = sheet_range(&mut wb, sheet)?;

        let mut iter = RangeDeserializerBuilder::new()
            .has_headers(true)
            .from_range::<_, DefectRecordExcel>(&range)
            .map_err(|e| format!("Failed to deserialize rows from '{}': {}", sheet, e))?;

        let mut defects = Vec::new();
        while let Some(row) = iter.next() {
            let rec_excel: DefectRecordExcel =
                row.map_err(|e| format!("Deserialization error in '{}': {}", sheet, e))?;
            defects.push(rec_excel.into());
        }

        result.insert(sheet.to_string(), defects);
    }

    Ok(result)
}

// =============================================================================
// Substrate layout mapping (grid)
// =============================================================================

fn cell_to_i32(cell: &Data) -> Option<i32> {
    match cell {
        Data::Int(v) => Some(*v as i32),
        Data::Float(f) => Some(*f as i32),
        Data::String(s) => s.trim().parse::<i32>().ok(),
        _ => None,
    }
}

fn cell_to_str(cell: &Data) -> Option<String> {
    match cell {
        Data::String(s) => Some(s.trim().to_string()),
        Data::Int(v) => Some(v.to_string()),
        Data::Float(f) => Some(f.to_string()),
        _ => None,
    }
}

#[tauri::command]
/// Parse an Excel layout where:
/// - Each sheet is a product ID.
/// - Row 1 (after A1) are X coordinates.
/// - Column A (after A1) are Y coordinates.
/// - Interior cells contain die values (numbers or single-char markers).
pub fn parse_die_layout_xls(path: String) -> Result<HashMap<String, DieLayoutSheet>, String> {
    let mut wb =
        open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel '{}': {}", path, e))?;

    let mut out: HashMap<String, DieLayoutSheet> = HashMap::new();
    let mut warnings: Vec<String> = Vec::new();

    for sheet in wb.sheet_names().to_owned() {
        let range = sheet_range(&mut wb, &sheet)?;
        let rows: Vec<_> = range.rows().collect();
        if rows.len() < 2 {
            warnings.push(format!("Sheet '{}' skipped: less than 2 rows", sheet));
            continue;
        }

        let x_headers: Vec<i32> = rows[0]
            .iter()
            .skip(1)
            .filter_map(cell_to_i32)
            .collect();
        if x_headers.is_empty() {
            warnings.push(format!("Sheet '{}' skipped: no X headers found in first row", sheet));
            continue;
        }

        let mut dies: Vec<AsciiDie> = Vec::new();
        let mut y_headers: Vec<i32> = Vec::new();

        for (_row_idx, row) in rows.iter().enumerate().skip(1) {
            if row.is_empty() {
                warnings.push(format!("Sheet '{}' row {} empty; skipped", sheet, _row_idx + 1));
                continue;
            }

            let y = match row.get(0).and_then(cell_to_i32) {
                Some(v) => v,
                None => {
                    warnings.push(format!(
                        "Sheet '{}' row {} has non-numeric Y header; skipped row",
                        sheet,
                        _row_idx + 1
                    ));
                    continue;
                }
            };
            y_headers.push(y);

            for (col_idx, cell) in row.iter().enumerate().skip(1) {
                let x = match x_headers.get(col_idx - 1) {
                    Some(v) => *v,
                    None => {
                        warnings.push(format!(
                            "Sheet '{}' row {} col {} has no X header; skipped cell",
                            sheet,
                            _row_idx + 1,
                            col_idx + 1
                        ));
                        continue;
                    }
                };

                let val = match cell_to_str(cell) {
                    Some(v) => v,
                    None => {
                        warnings.push(format!(
                            "Sheet '{}' row {} col {} could not parse value; skipped",
                            sheet,
                            _row_idx + 1,
                            col_idx + 1
                        ));
                        continue;
                    }
                };
                let v = val.trim();
                if v.is_empty() || v == "." {
                    continue;
                }

                let bin = match v.parse::<i32>() {
                    Ok(num) => BinValue::Number(num),
                    Err(_) => {
                        let ch = v.chars().next().unwrap_or('.');
                        BinValue::Special(ch)
                    }
                };

                dies.push(AsciiDie { x, y, bin });
            }
        }

        if !dies.is_empty() {
            out.insert(
                sheet.clone(),
                DieLayoutSheet {
                    x_headers,
                    y_headers,
                    dies,
                },
            );
        } else {
            warnings.push(format!("Sheet '{}' had headers but no dies; skipped", sheet));
        }
    }

    if out.is_empty() {
        return Err(format!(
            "Failed to parse die layout; no valid sheets. Warnings: {}",
            warnings.join(" | ")
        ));
    }

    if !warnings.is_empty() {
        println!("[die_layout_warnings] {}", warnings.join(" | "));
    }

    Ok(out)
}

#[derive(serde::Serialize)]
pub struct DieLayoutSheet {
    #[serde(rename = "xHeaders")]
    pub x_headers: Vec<i32>,
    #[serde(rename = "yHeaders")]
    pub y_headers: Vec<i32>,
    pub dies: Vec<AsciiDie>,
}

#[tauri::command]
/// Debug helper: print the X/Y coords for each sheet in a die layout Excel.
pub fn debug_print_die_layout_coords(path: String) -> Result<(), String> {
    let map = parse_die_layout_xls(path)?;
    for (sheet, layout) in map {
        println!("Sheet: {}", sheet);
        println!("  X headers: {:?}", layout.x_headers);
        println!("  Y headers: {:?}", layout.y_headers);
        for d in &layout.dies {
            println!("  ({}, {})", d.x, d.y);
        }
    }
    Ok(())
}

// =============================================================================
// NOTE: Wrappings for the Tauri command
// =============================================================================

/// Parse a plain‐text wafer definition file into your `Wafer` struct.
pub fn parse_wafer(path: String) -> Result<Wafer, String> {
    let lines = read_txt(&path).map_err(|e| format!("Failed to read map '{}': {}", path, e))?;
    Wafer::from_lines(&lines).map_err(|e| format!("Failed to parse wafer: {}", e))
}

/// Parse a wafer-map (simple) file into your `WaferMap` struct.
pub fn parse_wafer_bin(path: String) -> Result<BinMapData, String> {
    let lines =
        read_txt(&path).map_err(|e| format!("Failed to read .WaferMap '{}': {}", path, e))?;
    BinMapData::from_lines(&lines).map_err(|e| format!("Failed to parse wafer map: {}", e))
}

/// Parse an extended wafer-map (with extra metadata) into `WaferMapEx`.
pub fn parse_wafer_map_data(path: String) -> Result<MapData, String> {
    let lines = read_txt(&path).map_err(|e| format!("Failed to read map ex'{}': {}", path, e))?;
    MapData::from_lines(&lines).map_err(|e| format!("Failed to parse wafer map ex: {}", e))
}
