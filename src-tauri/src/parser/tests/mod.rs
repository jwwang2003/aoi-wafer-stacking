#[test]
fn test_parse_product_mapping_xls() {
    use super::parse_product_mapping_xls;

    let path = "static/Product list.xlsx".to_string();

    let by_sheet = parse_product_mapping_xls(path.clone())
        .expect(&format!("Failed to parse product mapping from '{}'", path));

    // Ensure we got at least one sheet and at least one row overall
    assert!(
        !by_sheet.is_empty(),
        "No sheets returned in product mapping result"
    );
    let total_rows: usize = by_sheet.values().map(|v| v.len()).sum();
    assert!(
        total_rows > 0,
        "No product mapping rows parsed across any sheet"
    );

    // Print all sheets and all rows
    for (sheet_name, rows) in &by_sheet {
        println!(
            "--- Sheet '{}' → {} mapping rows ---",
            sheet_name,
            rows.len()
        );
        for (i, record) in rows.iter().enumerate() {
            println!("[{}] {:#?}", i + 1, record);
        }
    }

    // Optional sanity check on the first non-empty sheet
    let (_, first_rows) = by_sheet
        .iter()
        .find(|(_, v)| !v.is_empty())
        .expect("All sheets present but empty mappings");
    let first = &first_rows[0];

    assert!(!first.oem_id.is_empty(), "oemId should not be empty");
    assert!(
        !first.product_id.is_empty(),
        "productId should not be empty"
    );
}

#[test]
fn test_parse_product_xls() {
    use super::parse_product_xls;

    let path = "static/P0097B_20250721160205.xlsx".to_string();

    let by_sheet = parse_product_xls(path.clone())
        .expect(&format!("Failed to parse product records from '{}'", path));

    // Ensure we got at least one sheet and at least one row overall
    assert!(
        !by_sheet.is_empty(),
        "No sheets returned in product XLS result"
    );
    let total_rows: usize = by_sheet.values().map(|v| v.len()).sum();
    assert!(total_rows > 0, "No product rows parsed across any sheet");

    // Print all sheets and all rows
    for (sheet_name, rows) in &by_sheet {
        println!(
            "--- Sheet '{}' → {} product rows ---",
            sheet_name,
            rows.len()
        );
        for (i, record) in rows.iter().enumerate() {
            println!("[{}] {:#?}", i + 1, record);
        }
    }

    // Optional sanity check on first non-empty sheet
    let (_, first_rows) = by_sheet
        .iter()
        .find(|(_, v)| !v.is_empty())
        .expect("All sheets present but empty product rows");
    let first = &first_rows[0];

    assert!(
        !first.product_id.is_empty(),
        "productId should not be empty"
    );
    assert!(!first.wafer_id.is_empty(), "waferId should not be empty");
}

#[test]
fn test_parse_substrate_defect_xls() {
    use super::parse_substrate_defect_xls;

    let path = "static/86107919CNF1.xls".to_string();

    let defects_by_sheet = parse_substrate_defect_xls(path.clone())
        .expect(&format!("Failed to parse defects from '{}'", path));

    // Should contain the required sheets as keys
    assert!(
        defects_by_sheet.contains_key("Surface defect list"),
        "Missing 'Surface defect list' in result keys: {:?}",
        defects_by_sheet.keys().collect::<Vec<_>>()
    );
    assert!(
        defects_by_sheet.contains_key("PL defect list"),
        "Missing 'PL defect list' in result keys: {:?}",
        defects_by_sheet.keys().collect::<Vec<_>>()
    );

    // Sum all records across sheets and ensure we got something
    let total: usize = defects_by_sheet.values().map(|v| v.len()).sum();
    assert!(total > 0, "No defect records parsed across any sheet");

    // Print all sheets and all rows
    for (sheet_name, rows) in &defects_by_sheet {
        println!(
            "--- Sheet '{}' → {} defect rows ---",
            sheet_name,
            rows.len()
        );
        for (i, record) in rows.iter().enumerate() {
            println!("[{}] {:#?}", i + 1, record);
        }
    }

    // Optional sanity check on the first non-empty sheet
    let (_, first_rows) = defects_by_sheet
        .iter()
        .find(|(_, v)| !v.is_empty())
        .expect("All sheets present but no rows parsed");
    let first = &first_rows[0];
    assert!(first.x != 0.0, "X coordinate should not be zero");
    assert!(first.y != 0.0, "Y coordinate should not be zero");
}

#[test]
fn test_parse_wafer_0() {
    use super::parse_wafer;
    let path = "static/P0094B_B003332_01.txt".to_string();
    match parse_wafer(path) {
        Ok(wafer) => {
            println!("Parsed Wafer: {:#?}", wafer);
            assert!(!wafer.map.raw.is_empty(), "Wafer map should not be empty");
            assert_eq!(
                wafer.gross_die,
                wafer.pass_die + wafer.fail_die,
                "Die counts should match"
            );
        }
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}

#[test]
fn test_parse_wafer_bin() {
    use super::parse_wafer_bin;
    let path = "static/B003332-01_20250325_170454.WaferMap".to_string();
    match parse_wafer_bin(path) {
        Ok(wafer) => {
            println!("Parsed WaferMap: {:#?}", wafer);
            assert!(!wafer.map.is_empty(), "Wafer map should not be empty");
        }
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}

#[test]
fn test_parse_wafer_map_data() {
    use super::parse_wafer_map_data;
    let path = "static/S1M032120B_B003332_01_mapEx.txt".to_string();
    match parse_wafer_map_data(path) {
        Ok(wafer) => {
            println!("Parsed Wafer MapEx: {:#?}", wafer);
            assert!(!wafer.map.raw.is_empty(), "Wafer map should not be empty");
        }
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}
