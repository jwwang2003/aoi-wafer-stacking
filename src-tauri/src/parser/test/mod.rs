// src-tauri/src/parser/test/mod.rs

use super::*;

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE1: &str = "\
Device Name       : S1M032120B
Lot No.           : B003332
Wafer ID          : 01
Wafer Size        : 6\"  
Dice SizeX        : 4986.000
Dice SizeY        : 3740.000
Flat/Notch        : Down
Map Column        : 2
Map Row           : 3
Total Tested      : 6
Total Pass        : 5
Total Fail        : 1
Yield             : 83.33%  

...........S3433S...........
.........3311113334.........
........411111111333........
......3314111111111333......
.....331881111111181333.....
.....311111111111311133.....
....33111111111111111133....
...3111111111111111111134...
...3111111111131111111113...
..311111A11111111511111133..
..311111113111111111111113..
.311111111111111111A1111133.
.3111111A411111111111111143.
.31111111111141111111A11113.
.11111111111111111111111111.
3111111111111111111111111113
31111111118111A1111111111113
3111111111111111111114111111
3111111111111711111111111111
31111A1111111711111111111111
3111111111311111111111111111
3111111111111111111111111111
1111113114111111111111111111
.11111111111118111111111111.
.11141111111111111111111111.
.11111111111111111111111111.
.11111111111111111111111111.
..111111111111111111111111..
..111111111111111111111111..
...1111111111111111111111...
...1111111111111111311111...
....11111111111111111111....
.....111111111111111111.....
......11111111111311111.....
.......11111141111111.......
........111111111111........
.........4111111111.........
";

    #[test]
    fn parse_file1_str_basic() {
        let info = parse_file1_str(SAMPLE1).expect("should parse SAMPLE1");
        assert_eq!(info.device_name, "S1M032120B");
        assert_eq!(info.lot_no, "B003332");
        assert_eq!(info.map_columns, 2);
        assert_eq!(info.total_pass, 5);
        assert!((info.yield_percent - 83.33).abs() < 1e-6);
        assert_eq!(info.ascii_map, vec!["ABC", "DEF", "GHI"]);
    }

    const SAMPLE3: &str = "\
WaferType: 0
DUT:1
Mode:1
Product:Foo
Wafer Lots:Foo-123
Wafer No:7
Wafer Size:6.00
Index X:10.0
Index Y:20.0

[MAP]:
0 0 1 0
1 0 2 1
";

    #[test]
    fn parse_file3_str_basic() {
        let map = parse_file3_str(SAMPLE3).expect("parse SAMPLE3");
        assert_eq!(map.wafer_type, 0);
        assert_eq!(map.product, "Foo");
        assert_eq!(map.wafer_no, 7);
        assert!((map.index_x - 10.0).abs() < 1e-6);
        assert_eq!(map.entries.len(), 2);
        assert_eq!(map.entries[1].code, 2);
        assert_eq!(map.entries[1].flag, 1);
    }
}
