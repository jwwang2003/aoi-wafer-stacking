mod tests;

use crate::wafer::ds::{DefectRecordExcel, ProductRecord, ProductRecordExcel};

use super::file::read_txt;
use super::wafer::ds::{BinMapData, DefectRecord, MapData, ProductMappingRecord, Wafer};
use calamine::DataType;
use calamine::{open_workbook_auto, RangeDeserializerBuilder, Reader};
use std::collections::{HashMap, HashSet};

#[tauri::command]
pub fn parse_product_mapping_xls(
    path: String,
) -> Result<HashMap<String, Vec<ProductMappingRecord>>, String> {
    let mut wb =
        open_workbook_auto(&path).map_err(|e| format!("Failed to open Excel '{}': {}", path, e))?;

    let mut result: HashMap<String, Vec<ProductMappingRecord>> = HashMap::new();

    for sheet in wb.sheet_names().to_owned() {
        let range = wb
            .worksheet_range(&sheet)
            .map_err(|e| format!("Error reading sheet '{}': {}", sheet, e))?;

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
        let range = wb
            .worksheet_range(&sheet)
            .map_err(|e| format!("Error reading sheet '{}': {}", sheet, e))?;

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
        let range = wb
            .worksheet_range(sheet)
            .map_err(|e| format!("Error reading sheet '{}': {}", sheet, e))?;

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
