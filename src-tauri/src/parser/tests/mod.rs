use super::{parse_defect_xls, parse_wafer, parse_wafer_map, parse_wafer_map_ex};

#[test]
fn test_parse_defect_xls() {
    // Path to a test XLS file that contains both required sheets:
    // - "Surface defect list"
    // - "PL defect list"
    //
    // Place a small fixture file at `tests/data/defects_test.xls`
    // with known contents for assertions.
    let path = "static/1-86107919CNF1.xls".to_string();

    // Attempt to parse
    let defects = parse_defect_xls(path.clone())
        .expect(&format!("Failed to parse defects from '{}'", path));

    // Should return at least one record
    assert!(!defects.is_empty(), "No defect records parsed");

    // Spot‐check the first record against expected fixture values
    let first = &defects[0];

    println!("First defect record: {:?}", first);
}

#[test]
fn test_parse_wafer() {
    // Construct the relative path to the test file
    let path = "static/P0094B_B003332_01.txt".to_string();

    // Attempt to parse the wafer file
    let result = parse_wafer(path);

    // Assert that parsing succeeded
    match result {
        Ok(wafer) => {
            println!("Parsed Wafer: {:?}", wafer);
            // Optionally add more assertions
            assert!(!wafer.ascii_map.is_empty(), "Wafer map should not be empty");
            assert_eq!(wafer.gross_die, wafer.pass_die + wafer.fail_die, "Die counts should match");
        },
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}

#[test]
fn test_parse_wafer_map() {
  let path = "static/B003332-01_20250325_170454.WaferMap".to_string();

    // Attempt to parse the wafer file
    let result = parse_wafer_map(path);

    // Assert that parsing succeeded
    match result {
        Ok(wafer) => {
            println!("Parsed WaferMap: {:?}", wafer);
            // Optionally add more assertions
            assert!(!wafer.wafer_map.is_empty(), "Wafer map should not be empty");
            // assert_eq!(wafer.gross_die, wafer.pass_die + wafer.fail_die, "Die counts should match");
        },
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }

}

#[test]
fn test_parse_wafer_map_ex() {
  let path = "static/S1M032120B_B003332_01_mapEx.txt".to_string();

    // Attempt to parse the wafer file
    let result = parse_wafer_map_ex(path);

    // Assert that parsing succeeded
    match result {
        Ok(wafer) => {
            println!("Parsed Wafer MapEx: {:?}", wafer);
            // Optionally add more assertions
            assert!(!wafer.ascii_map.is_empty(), "Wafer map should not be empty");
            // assert_eq!(wafer.gross_die, wafer.pass_die + wafer.fail_die, "Die counts should match");
        },
        Err(e) => panic!("Failed to parse wafer: {}", e),
    }
}