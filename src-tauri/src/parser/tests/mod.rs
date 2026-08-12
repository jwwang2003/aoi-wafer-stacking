//! Parser tests run against the shared fixture set in `test/fixtures/`.
//! Cargo runs tests with CWD = `src-tauri`, so paths are relative to it.

use std::fs;
use std::path::PathBuf;

fn fixture(rel: &str) -> String {
    let path = PathBuf::from("../test/fixtures").join(rel);
    assert!(path.exists(), "missing fixture: {}", path.display());
    path.to_string_lossy().into_owned()
}

#[test]
fn test_parse_product_mapping_xls() {
    use super::parse_product_mapping_xls;

    let path = fixture("parser/product-mapping.xlsx");

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

    let path = fixture("parser/product-list.xlsx");

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

    let path = fixture("parser/substrate-defect.xls");

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
    let path = fixture("parser/fab-cp-wafer.txt");
    match parse_wafer(path) {
        Ok(wafer) => {
            println!("Parsed Wafer: {:#?}", wafer);
            assert_eq!(wafer.operator, "E023933");
            assert_eq!(wafer.device, "P0094B");
            assert_eq!(wafer.lot_id, "B003332");
            assert_eq!(wafer.wafer_id, "1");
            assert_eq!(wafer.gross_die, 805);
            assert_eq!(wafer.pass_die, 777);
            assert_eq!(wafer.fail_die, 28);
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
    let path = fixture("parser/wlbi-bin.WaferMap");
    match parse_wafer_bin(path) {
        Ok(wafer) => {
            println!("Parsed WaferMap: {:#?}", wafer);
            assert_eq!(wafer.product, "S1M032120B-U");
            assert_eq!(wafer.wafer_lots, "S1M032120B-B003332-1-0");
            assert_eq!(wafer.wafer_no, "03");
            assert_eq!(wafer.wafer_size, 6.0);
            assert_eq!(wafer.index_x, 4986.0);
            assert_eq!(wafer.index_y, 3740.0);
            assert_eq!(wafer.map.first().map(|die| (die.x, die.y)), Some((-3, -18)));
            assert!(!wafer.map.is_empty(), "Wafer map should not be empty");
        }
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}

#[test]
fn test_parse_wafer_map_data() {
    use super::parse_wafer_map_data;
    let path = fixture("parser/wafer-mapEx.txt");
    match parse_wafer_map_data(path) {
        Ok(wafer) => {
            println!("Parsed Wafer MapEx: {:#?}", wafer);
            assert_eq!(wafer.device_name, "S1M032120B");
            assert_eq!(wafer.lot_no, "B003332");
            assert_eq!(wafer.wafer_id, "01");
            assert_eq!(wafer.map_columns, 28);
            assert_eq!(wafer.map_rows, 37);
            assert_eq!(wafer.total_tested, 805);
            assert_eq!(wafer.total_pass, 724);
            assert_eq!(wafer.total_fail, 81);
            assert!(!wafer.map.raw.is_empty(), "Wafer map should not be empty");
        }
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}

#[test]
fn test_parse_die_layout_xls() {
    use super::parse_die_layout_xls;
    use crate::wafer::ds::BinValue;

    let path = fixture("parser/die-layout.xlsx");
    let layouts = parse_die_layout_xls(path).expect("Failed to parse die layout xlsx");

    for (sheet, expected_dies) in [("S1M032120B", 807usize), ("S1M040120B", 981usize)] {
        let layout = layouts
            .get(sheet)
            .unwrap_or_else(|| panic!("Missing layout sheet '{}': {:?}", sheet, layouts.keys()));
        assert_eq!(layout.dies.len(), expected_dies, "die count for '{}'", sheet);

        let markers: Vec<_> = layout
            .dies
            .iter()
            .filter(|die| matches!(&die.bin, BinValue::Special(c) if *c == 'S'))
            .collect();
        assert_eq!(markers.len(), 2, "alignment markers for '{}'", sheet);
    }
}

/// Regenerates `test/fixtures/parsed/*.json` — the parsed-layer fixtures the
/// vitest suite runs the stacking pipeline against. The JSON is serialized
/// with the same serde definitions Tauri IPC uses, so the TS side sees
/// identical shapes to production `invoke` results.
///
/// Run explicitly with:
/// `cargo test --no-default-features dump_parsed_fixtures -- --ignored`
#[test]
#[ignore]
fn dump_parsed_fixtures() {
    use super::{parse_substrate_defect_xls, parse_wafer, parse_wafer_bin, parse_wafer_map_data};

    fn write_json<T: serde::Serialize>(rel: &str, value: &T) {
        let path = PathBuf::from("../test/fixtures/parsed").join(rel);
        fs::create_dir_all(path.parent().unwrap()).expect("create parsed fixture dir");
        let json = serde_json::to_string_pretty(value).expect("serialize fixture");
        fs::write(&path, json).expect("write fixture");
        println!("wrote {}", path.display());
    }

    // Lot B003332 — wafer 01 across all map stages
    write_json(
        "B003332/fab-cp.json",
        &parse_wafer(fixture("lots/B003332/fab-cp/P0094B_B003332_01.txt")).unwrap(),
    );
    write_json(
        "B003332/cp1.json",
        &parse_wafer_map_data(fixture("lots/B003332/cp1/S1M032120B_B003332_01_mapEx.txt"))
            .unwrap(),
    );
    write_json(
        "B003332/cp2.json",
        &parse_wafer_map_data(fixture("lots/B003332/cp2/S1M032120B_B003332_01_mapEx.txt"))
            .unwrap(),
    );
    write_json(
        "B003332/wlbi.json",
        &parse_wafer_bin(fixture("lots/B003332/wlbi/B003332-01_20250325_170454.WaferMap"))
            .unwrap(),
    );
    write_json(
        "B003332/aoi.json",
        &parse_wafer_map_data(fixture("lots/B003332/aoi/S1M032120B_B003332_01.txt")).unwrap(),
    );

    // Lot B003990 — wafer 02 across all stages, plus substrate defect list
    write_json(
        "B003990/fab-cp.json",
        &parse_wafer(fixture("lots/B003990/fab-cp/P0097B_B003990_02.txt")).unwrap(),
    );
    write_json(
        "B003990/cp1.json",
        &parse_wafer_map_data(fixture(
            "lots/B003990/cp1/S1M040120B_B003990_02_mapEx.txt",
        ))
        .unwrap(),
    );
    write_json(
        "B003990/cp2.json",
        &parse_wafer_map_data(fixture(
            "lots/B003990/cp2/S1M040120B_B003990_02_mapEx.txt",
        ))
        .unwrap(),
    );
    write_json(
        "B003990/wlbi.json",
        &parse_wafer_bin(fixture(
            "lots/B003990/wlbi/B003990_02_20250325_165831.WaferMap",
        ))
        .unwrap(),
    );
    write_json(
        "B003990/aoi.json",
        &parse_wafer_map_data(fixture(
            "lots/B003990/aoi/S1M040120B_B003990_02_20250721095040.txt",
        ))
        .unwrap(),
    );
    write_json(
        "B003990/substrate-defects.json",
        &parse_substrate_defect_xls(fixture("lots/B003990/substrate/86107919CNF1.xls")).unwrap(),
    );

    // 基板布局 Excel — one sheet per product, shared by both lots
    write_json(
        "die-layout.json",
        &super::parse_die_layout_xls(fixture("parser/die-layout.xlsx")).unwrap(),
    );
}
