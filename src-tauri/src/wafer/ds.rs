use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::{Display, Write};
use std::str::FromStr;

macro_rules! pad18 {
    ($val:expr) => {
        &format!("{:<18}", $val)
    };
}

// helper to pull "Key: Value" lines
fn parse_kv<'a>(it: &mut impl Iterator<Item = &'a String>, key: &str) -> Result<String, String> {
    let line = it
        .next()
        .ok_or_else(|| format!("Missing header line for `{}`", key))?;
    let prefix = format!("{}:", key);
    if !line.starts_with(&prefix) {
        return Err(format!("Expected `{key}: ...`, found `{}`", line));
    }
    // split at the first colon, then trim
    let parts: Vec<_> = line.splitn(2, ':').collect();
    let val = parts
        .get(1)
        .ok_or_else(|| format!("Malformed `{}` line", key))?
        .trim()
        .to_string();
    Ok(val)
}

// =============================================================================

#[derive(Debug, Deserialize, Serialize)]
pub struct ProductMappingRecord {
    #[serde(rename = "oemId")]
    pub oem_id: String,
    #[serde(rename = "productId")]
    pub product_id: String,
}

// =============================================================================

#[derive(Debug, Deserialize)]
pub struct ProductRecordExcel {
    #[serde(rename = "Product ID")]
    pub product_id: String,
    #[serde(rename = "Lot ID")]
    pub batch_id: String,
    #[serde(rename = "Wafer ID")]
    pub wafer_id: String,
    #[serde(rename = "Sub ID")]
    pub sub_id: String,
}

/// Output for Tauri
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductRecord {
    pub product_id: String,
    pub batch_id: String,
    pub wafer_id: String,
    pub sub_id: String,
}

impl From<ProductRecordExcel> for ProductRecord {
    fn from(src: ProductRecordExcel) -> Self {
        Self {
            product_id: src.product_id,
            batch_id: src.batch_id,
            wafer_id: src.wafer_id,
            sub_id: src.sub_id,
        }
    }
}

// =============================================================================

/// .xls Wafer defect list data structures
#[derive(Debug, Deserialize)]
pub struct DefectRecordExcel {
    #[serde(rename = "No.")]
    pub no: u32,
    #[serde(rename = "X(mm)")]
    pub x: f64,
    #[serde(rename = "Y(mm)")]
    pub y: f64,
    #[serde(rename = "W(um)")]
    pub w: f64,
    #[serde(rename = "H(um)")]
    pub h: f64,
    #[serde(rename = "Area(um2)")]
    pub area: f64,
    #[serde(rename = "Class")]
    pub class: String,
    #[serde(rename = "Contrast")]
    pub contrast: u32,
    #[serde(rename = "Channel")]
    pub channel: String,
}

/// Output for Tauri
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefectRecord {
    pub no: u32,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub area: f64,
    pub class: String,
    pub contrast: u32,
    pub channel: String,
}

impl From<DefectRecordExcel> for DefectRecord {
    fn from(r: DefectRecordExcel) -> Self {
        Self {
            no: r.no,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            area: r.area,
            class: r.class,
            contrast: r.contrast,
            channel: r.channel,
        }
    }
}

// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BinValue {
    Number(i32),
    Special(char), // e.g. 'S', '*', 'A', 'B'
}

impl std::fmt::Display for BinValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BinValue::Number(n) => write!(f, "{n}"),
            BinValue::Special(c) => write!(f, "{c}"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BinCountEntry {
    pub bin: u32,
    pub count: u32,
}

// Two types of die structures are defined here,
// the default is AsciiDie, WaferMap uses the Die

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Used by WaferMap format
pub struct WaferMapDie {
    pub x: i32,
    pub y: i32,
    pub bin: BinValue,
    pub reserved: i32,
}

impl From<[i32; 4]> for WaferMapDie {
    fn from(q: [i32; 4]) -> Self {
        Self {
            x: q[0],
            y: q[1],
            bin: BinValue::Number(q[2]),
            reserved: q[3],
        }
    }
}

// impl WaferMapDie {
//     #[inline]
//     pub fn as_array(&self) -> [i32; 4] {
//         let bin_num = match self.bin {
//             BinValue::Number(n) => n,
//             BinValue::Special(c) => {
//                 // WaferMap text format is numeric; decide your policy here.
//                 // Using 0 as a safe fallback:
//                 debug_assert!(false, "Special bin '{c}' in WaferMapDie; emitting 0");
//                 0
//             }
//         };
//         [self.x, self.y, bin_num, self.reserved]
//     }
// }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Used by default when reading MAPs
pub struct AsciiDie {
    pub x: i32,
    pub y: i32,
    pub bin: BinValue,
}

/// Holds both the raw map text and the parsed dies.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsciiMap {
    /// Original lines as read from the file
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub raw: Vec<String>,
    /// Structured dies parsed from `raw`
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub dies: Vec<AsciiDie>,
}

// =============================================================================

/// Wafer defect list data structure
/// STAGE: FAB CP
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wafer {
    pub operator: String,
    pub device: String,
    pub lot_id: String,
    pub wafer_id: String,
    pub meas_time: String,
    pub gross_die: u32,
    pub pass_die: u32,
    pub fail_die: u32,
    pub total_yield: f64,
    pub notch: String,
    pub map: AsciiMap,
}

impl Wafer {
    /// Re-serialize back to the original text‐file format
    pub fn to_string(&self) -> String {
        let mut out = String::new();
        writeln!(out, "Operator: {}", self.operator).unwrap();
        writeln!(out, "Device: {}", self.device).unwrap();
        writeln!(out, "Lot ID: {}", self.lot_id).unwrap();
        writeln!(out, "Wafer ID: {}", self.wafer_id).unwrap();
        writeln!(out, "Meas Time: {}", self.meas_time).unwrap();
        writeln!(out, "Gross Die: {}", self.gross_die).unwrap();
        writeln!(out, "Pass Die: {}", self.pass_die).unwrap();
        writeln!(out, "Fail Die: {}", self.fail_die).unwrap();
        writeln!(out, "Total Yield: {:.2}%", self.total_yield).unwrap();
        writeln!(out, "notch-{}", self.notch).unwrap();
        writeln!(out).unwrap(); // blank line before ASCII map

        // Print the raw ASCII map as-is
        for line in &self.map.raw {
            writeln!(out, "{}", line).unwrap();
        }
        out
    }

    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        let mut it = lines.iter();

        // Parse all the headers:
        let operator = parse_kv(&mut it, "Operator")?;
        let device = parse_kv(&mut it, "Device")?;
        let lot_id = parse_kv(&mut it, "Lot ID")?;
        let wafer_id = parse_kv(&mut it, "Wafer ID")?;
        let meas_time = parse_kv(&mut it, "Meas Time")?;
        let gross_die = parse_kv(&mut it, "Gross Die")?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Gross Die: {}", e))?;
        let pass_die = parse_kv(&mut it, "Pass Die")?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Pass Die: {}", e))?;
        let fail_die = parse_kv(&mut it, "Fail Die")?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Fail Die: {}", e))?;
        let total_yield = {
            let ty = parse_kv(&mut it, "Total Yield")?;
            ty.trim_end_matches('%')
                .parse::<f64>()
                .map_err(|e| format!("Invalid Total Yield `{}`: {}", ty, e))?
        };

        // Next line is the notch orientation (no colon)
        let notch = it
            .next()
            .ok_or_else(|| "Missing notch orientation".to_string())?
            .trim()
            .to_string();

        // The rest is the ASCII map (skip any blanks before the first row)
        let mut raw: Vec<String> = Vec::new();
        while let Some(l) = it.next() {
            if l.trim().is_empty() {
                continue;
            }
            raw.push(l.clone());
            break;
        }
        for l in it {
            if !l.trim().is_empty() {
                raw.push(l.clone());
            }
        }
        if raw.is_empty() {
            return Err("No ASCII map after notch line".into());
        }

        // Parse dies from raw (centered mapping: (0,0)->(-cols/2, -rows/2))
        let rows = raw.len() as i32;
        let cols = raw.iter().map(|s| s.len()).max().unwrap_or(0) as i32;
        let x0 = -(cols / 2);
        let y0 = -(rows / 2);

        let mut dies: Vec<AsciiDie> = Vec::with_capacity((rows * cols).max(0) as usize);
        for (row_idx, row) in raw.iter().enumerate() {
            let row_idx = row_idx as i32;
            for (col_idx, b) in row.bytes().enumerate() {
                let x = x0 + col_idx as i32;
                let y = y0 + row_idx;
                match b {
                    b'.' => {}
                    b'0'..=b'9' => dies.push(AsciiDie {
                        x,
                        y,
                        bin: BinValue::Number((b - b'0') as i32),
                    }),
                    other => dies.push(AsciiDie {
                        x,
                        y,
                        bin: BinValue::Special(other as char),
                    }),
                }
            }
        }

        Ok(Wafer {
            operator,
            device,
            lot_id,
            wafer_id,
            meas_time,
            gross_die,
            pass_die,
            fail_die,
            total_yield,
            notch,
            map: AsciiMap { raw, dies },
        })
    }
}

// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// STAGE: CP-prober & AOI
pub struct MapData {
    pub device_name: String,
    pub lot_no: String,
    pub wafer_id: String,
    pub wafer_size: String,
    pub dice_size_x: f64,
    pub dice_size_y: f64,
    pub flat_notch: String,

    pub map_columns: u32,
    pub map_rows: u32,

    pub total_tested: u32,
    pub total_pass: u32,
    pub total_fail: u32,
    pub yield_percent: f64,

    pub map: AsciiMap, // <-- a single struct holding both forms
}

impl MapData {
    pub fn to_string(&self) -> String {
        let mut out = String::new();

        // --- Header ---
        writeln!(out, "Device Name      : {}", self.device_name).unwrap();
        writeln!(out, "Lot No.          : {}", self.lot_no).unwrap();
        writeln!(out, "Wafer ID         : {}", self.wafer_id).unwrap();
        writeln!(out, "Wafer Size       : {}", self.wafer_size).unwrap();
        writeln!(out, "Dice SizeX       : {:.3}", self.dice_size_x).unwrap();
        writeln!(out, "Dice SizeY       : {:.3}", self.dice_size_y).unwrap();
        writeln!(out, "Flat/Notch       : {}", self.flat_notch).unwrap();
        writeln!(out, "Map Column       : {}", self.map_columns).unwrap();
        writeln!(out, "Map Row          : {}", self.map_rows).unwrap();
        writeln!(out, "Total Tested     : {}", self.total_tested).unwrap();
        writeln!(out, "Total Pass       : {}", self.total_pass).unwrap();
        writeln!(out, "Total Fail       : {}", self.total_fail).unwrap();
        writeln!(out, "Yield            : {:.2}%", self.yield_percent).unwrap();

        // --- Raw ASCII map ---
        writeln!(out, "").unwrap();
        for row in &self.map.raw {
            writeln!(out, "{}", row).unwrap();
        }

        // --- Parsed dies ---
        // for die in &self.map.dies {
        //     writeln!(out, "Die (x={}, y={}) -> {:?}", die.x, die.y, die.bin).unwrap();
        // }

        out
    }

    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        let mut it = lines.iter();

        // --- headers ---
        let device_name = parse_kv(&mut it, pad18!(r"Device Name"))?;
        let lot_no = parse_kv(&mut it, pad18!(r"Lot No."))?;
        let wafer_id = parse_kv(&mut it, pad18!(r"Wafer ID"))?;
        let wafer_size = parse_kv(&mut it, pad18!(r"Wafer Size"))?;
        let dice_size_x = parse_kv(&mut it, pad18!(r"Dice SizeX"))?
            .parse::<f64>()
            .map_err(|e| format!("Invalid Dice SizeX: {e}"))?;
        let dice_size_y = parse_kv(&mut it, pad18!(r"Dice SizeY"))?
            .parse::<f64>()
            .map_err(|e| format!("Invalid Dice SizeY: {e}"))?;
        let flat_notch = parse_kv(&mut it, pad18!(r"Flat/Notch"))?;
        let map_columns = parse_kv(&mut it, pad18!(r"Map Column"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Map Column: {e}"))?;
        let map_rows = parse_kv(&mut it, pad18!(r"Map Row"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Map Row: {e}"))?;
        let total_tested = parse_kv(&mut it, pad18!(r"Total Tested"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Tested: {e}"))?;
        let total_pass = parse_kv(&mut it, pad18!(r"Total Pass"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Pass: {e}"))?;
        let total_fail = parse_kv(&mut it, pad18!(r"Total Fail"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Fail: {e}"))?;
        let yield_percent = {
            let v = parse_kv(&mut it, pad18!(r"Yield"))?;
            v.trim_end_matches('%')
                .parse::<f64>()
                .map_err(|e| format!("Invalid Yield: {e}"))?
        };

        // --- read raw map (skip leading blanks once) & parse dies in one pass ---
        let mut raw: Vec<String> = Vec::with_capacity(map_rows as usize);
        // upper bound reserve; actual dies ≤ rows*cols
        let mut dies: Vec<AsciiDie> =
            Vec::with_capacity((map_rows as usize) * (map_columns as usize));

        // compute centered origins once
        let cols_i = map_columns as i32;
        let rows_i = map_rows as i32;
        let x0 = -(cols_i / 2); // so col 0 -> x0
        let y0 = -(rows_i / 2); // so row 0 -> y0

        // advance to first non-empty line
        while let Some(line) = it.next() {
            if line.trim().is_empty() {
                continue;
            }
            raw.push(line.clone());

            // process the first map row we just pushed
            let row_idx = (raw.len() - 1) as i32;
            for (col_idx, b) in line.bytes().enumerate() {
                match b {
                    b'.' => {}
                    b'0'..=b'9' => {
                        dies.push(AsciiDie {
                            x: x0 + col_idx as i32,
                            y: y0 + row_idx,
                            bin: BinValue::Number((b - b'0') as i32),
                        });
                    }
                    other => {
                        dies.push(AsciiDie {
                            x: x0 + col_idx as i32,
                            y: y0 + row_idx,
                            bin: BinValue::Special(other as char),
                        });
                    }
                }
            }
            break;
        }

        // rest of the rows
        for line in it {
            if line.trim().is_empty() {
                continue;
            }
            raw.push(line.clone());
            let row_idx = (raw.len() - 1) as i32;
            for (col_idx, b) in line.bytes().enumerate() {
                match b {
                    b'.' => {}
                    b'0'..=b'9' => {
                        dies.push(AsciiDie {
                            x: x0 + col_idx as i32,
                            y: y0 + row_idx,
                            bin: BinValue::Number((b - b'0') as i32),
                        });
                    }
                    other => {
                        dies.push(AsciiDie {
                            x: x0 + col_idx as i32,
                            y: y0 + row_idx,
                            bin: BinValue::Special(other as char),
                        });
                    }
                }
            }
        }

        if raw.is_empty() {
            return Err("No map data found after headers".into());
        }

        Ok(Self {
            device_name,
            lot_no,
            wafer_id,
            wafer_size,
            dice_size_x,
            dice_size_y,
            flat_notch,
            map_columns,
            map_rows,
            total_tested,
            total_pass,
            total_fail,
            yield_percent,
            map: AsciiMap { raw, dies },
        })
    }
}

// =============================================================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// A.k.a. with extension .WaferMap
/// STAGE: WLBI
pub struct BinMapData {
    pub wafer_type: u32,
    pub dut: u32,
    pub mode: u32,
    pub product: String,
    pub wafer_lots: String,
    pub wafer_no: String,
    pub wafer_size: f64,

    pub index_x: f64,
    pub index_y: f64,

    pub map: Vec<WaferMapDie>,

    pub bins: Vec<BinCountEntry>,
}

impl BinMapData {
    pub fn to_string(&self) -> String {
        let mut out = String::new();

        // --- Header ---
        writeln!(out, "Wafer Type   : {}", self.wafer_type).unwrap();
        writeln!(out, "DUT          : {}", self.dut).unwrap();
        writeln!(out, "Mode         : {}", self.mode).unwrap();
        writeln!(out, "Product      : {}", self.product).unwrap();
        writeln!(out, "Wafer Lots   : {}", self.wafer_lots).unwrap();
        writeln!(out, "Wafer No     : {}", self.wafer_no).unwrap();
        writeln!(out, "Wafer Size   : {:.3}", self.wafer_size).unwrap();
        writeln!(out, "Index X      : {:.3}", self.index_x).unwrap();
        writeln!(out, "Index Y      : {:.3}", self.index_y).unwrap();

        // --- Map ---
        writeln!(out, "\n[MAP]:").unwrap();
        for die in &self.map {
            writeln!(out, "{} {} {} {}", die.x, die.y, die.bin, die.reserved).unwrap();
        }

        // --- Bin counts ---
        writeln!(out, "\n").unwrap();
        for entry in &self.bins {
            writeln!(out, "Bin{:>2} {:>3},", entry.bin, entry.count).unwrap();
        }

        writeln!(out, "\n## END ##").unwrap();

        out
    }

    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        let mut it = lines.iter().map(|s| s.trim()).filter(|l| !l.is_empty());

        fn parse_kv<'a, T: FromStr>(
            it: &mut impl Iterator<Item = &'a str>,
            key: &str,
        ) -> Result<T, String>
        where
            <T as FromStr>::Err: std::fmt::Display,
        {
            let line = it
                .next()
                .ok_or_else(|| format!("Missing '{}:' line", key))?;
            let parts: Vec<_> = line.splitn(2, ':').collect();
            if parts.len() != 2 || !parts[0].eq_ignore_ascii_case(key) {
                return Err(format!("Expected '{}: …', found '{}'", key, line));
            }
            parts[1]
                .trim()
                .parse()
                .map_err(|e| format!("{} parse error: {}", key, e))
        }

        let wafer_type = parse_kv(&mut it, "WaferType")?;
        let dut = parse_kv(&mut it, "DUT")?;
        let mode = parse_kv(&mut it, "Mode")?;
        let product = parse_kv::<String>(&mut it, "Product")?;
        let wafer_lots = parse_kv::<String>(&mut it, "Wafer Lots")?;
        let wafer_no = parse_kv::<String>(&mut it, "Wafer No")?;
        let wafer_size = parse_kv(&mut it, "Wafer Size")?;
        let index_x = parse_kv(&mut it, "Index X")?;
        let index_y = parse_kv(&mut it, "Index Y")?;

        while let Some(line) = it.next() {
            if line.contains("[MAP]") {
                break;
            }
        }

        let mut wafer_map = Vec::new();
        while let Some(l) = it.next() {
            if l.starts_with("Total Prober") || l.starts_with("Bin ") || l.starts_with("## END ##")
            {
                break;
            }
            let nums: Vec<i32> = l
                .split_whitespace()
                .map(|w| {
                    w.parse::<i32>()
                        .map_err(|e| format!("Map entry '{}' parse error: {}", l, e))
                })
                .collect::<Result<_, _>>()?;
            if nums.len() != 4 {
                return Err(format!("Bad map line '{}'; expected 4 ints", l));
            }
            wafer_map.push(WaferMapDie::from([nums[0], nums[1], nums[2], nums[3]]));
        }

        let mut bins_acc: BTreeMap<u32, u32> = BTreeMap::new();

        for l in it {
            if l.starts_with("## END ##") {
                break;
            }
            if !l.starts_with("Bin") {
                continue;
            }

            // Supports: "Bin 3 10", "Bin 3: 10", "Bin 1 5, Bin 2 7"
            for seg in l.split(',') {
                let seg = seg.trim();
                if let Some(rest) = seg.strip_prefix("Bin") {
                    let mut parts = rest.split_whitespace();

                    // bin id
                    let id_s = match parts.next() {
                        Some(s) => s,
                        None => continue, // skip malformed segment
                    };

                    // optional ":" token
                    let next = parts.next();
                    let cnt_tok = match next {
                        Some(":") => parts.next(),
                        Some(token) => Some(token),
                        None => None,
                    };

                    let id = id_s
                        .parse::<u32>()
                        .map_err(|e| format!("Bin id '{}' parse error: {}", id_s, e))?;
                    let cnt_s =
                        cnt_tok.ok_or_else(|| format!("Missing count for bin '{}'", id_s))?;
                    let cnt = cnt_s
                        .parse::<u32>()
                        .map_err(|e| format!("Bin count '{}' parse error: {}", cnt_s, e))?;

                    *bins_acc.entry(id).or_insert(0) += cnt;
                }
            }
        }

        // Convert to sorted Vec<BinCountEntry>
        let bins: Vec<BinCountEntry> = bins_acc
            .into_iter()
            .map(|(bin, count)| BinCountEntry { bin, count })
            .collect();

        Ok(BinMapData {
            wafer_type,
            dut,
            mode,
            product,
            wafer_lots,
            wafer_no,
            wafer_size,

            index_x,
            index_y,

            map: wafer_map,

            bins,
        })
    }
}

// =============================================================================

// NOTE: HEX/.sinf

/// One hex cell in a RowData line:
/// - `Some(u8)` = a bin code (e.g., 0x03, 0x01)
/// - `None`     = no die / masked-out position (rendered as `--`)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HexCell(pub Option<u8>);

/// Carries the raw text rows and the parsed numeric grid, plus
/// the flattened dies (centered coordinates, numeric bins only).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HexMap {
    /// Original `RowData:` lines (exact text after the colon)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub raw: Vec<String>,

    /// Parsed cells per row (length = row_ct; each inner vec length = col_ct)
    pub grid: Vec<Vec<HexCell>>,

    /// Flattened (x,y,bin) dies centered like your ASCII parser:
    /// (0,0 in file) → ( -col_ct/2, -row_ct/2 )
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub dies: Vec<AsciiDie>,
}

/// Header block for the HEX/SINF file
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HexHeader {
    pub device: String, // DEVICE
    pub lot: String,    // LOT
    pub wafer: String,  // WAFER
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fnloc: Option<u32>, // FNLOC (optional)
    pub row_ct: u32,    // ROWCT
    pub col_ct: u32,    // COLCT
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bcequ: Option<u32>, // BCEQU (optional)
    pub refpx: u32,     // REFPX
    pub refpy: u32,     // REFPY
    pub dut_ms: String, // DUTMS (e.g., "MM")
    pub x_dies: f64,    // XDIES
    pub y_dies: f64,    // YDIES
}

/// Top-level structure for the HEX/SINF format
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HexMapData {
    pub header: HexHeader,
    pub map: HexMap,
}

fn parse_hex_cell(tok: &str) -> Result<HexCell, String> {
    if tok == "--" {
        return Ok(HexCell(None));
    }
    if tok.len() != 2 {
        return Err(format!("Bad hex token '{}'", tok));
    }
    u8::from_str_radix(tok, 16)
        .map(|v| HexCell(Some(v)))
        .map_err(|e| format!("Hex parse '{}': {}", tok, e))
}

fn center_xy(col_ct: i32, row_ct: i32, col_idx: i32, row_idx: i32) -> (i32, i32) {
    let x = col_idx - (col_ct / 2);
    let y = row_idx - (row_ct / 2);
    (x, y)
}

impl HexMapData {
    /// Re-serialize to the original style (two-digit hex, `--` for gaps)
    pub fn to_string(&self) -> String {
        let mut out = String::new();
        let h = &self.header;
        writeln!(out, "DEVICE: {}", h.device).unwrap();
        writeln!(out, "LOT: {}", h.lot).unwrap();
        writeln!(out, "WAFER: {}", h.wafer).unwrap();
        if let Some(v) = h.fnloc {
            writeln!(out, "FNLOC: {}", v).unwrap();
        }
        writeln!(out, "ROWCT: {}", h.row_ct).unwrap();
        writeln!(out, "COLCT: {}", h.col_ct).unwrap();
        if let Some(v) = h.bcequ {
            writeln!(out, "BCEQU: {:02}", v).unwrap();
        }
        writeln!(out, "REFPX: {}", h.refpx).unwrap();
        writeln!(out, "REFPY: {}", h.refpy).unwrap();
        writeln!(out, "DUTMS: {}", h.dut_ms).unwrap();
        writeln!(out, "XDIES: {:.5}", h.x_dies).unwrap();
        writeln!(out, "YDIES: {:.5}", h.y_dies).unwrap();

        for row in &self.map.grid {
            write!(out, "RowData: ").unwrap();
            for (i, cell) in row.iter().enumerate() {
                if i > 0 {
                    write!(out, " ").unwrap();
                }
                match cell.0 {
                    Some(v) => write!(out, "{:02X}", v).unwrap(), // two-digit uppercase hex
                    None => write!(out, "--").unwrap(),
                }
            }
            writeln!(out).unwrap();
        }
        out
    }

    // TODO: Remember to use this
    #[allow(dead_code)]
    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        // Trim empty lines once
        let mut it = lines.iter().map(|s| s.trim()).filter(|s| !s.is_empty());

        // Generic helper with an explicit lifetime on the &str item.
        fn kv<'a, I, T>(it: &mut I, key: &str) -> Result<T, String>
        where
            I: Iterator<Item = &'a str>,
            T: FromStr,
            T::Err: Display,
        {
            let line = it
                .next()
                .ok_or_else(|| format!("Missing '{}:' line", key))?;
            let parts: Vec<_> = line.splitn(2, ':').collect();
            if parts.len() != 2 || !parts[0].eq_ignore_ascii_case(key) {
                return Err(format!("Expected '{}: …', found '{}'", key, line));
            }
            parts[1]
                .trim()
                .parse()
                .map_err(|e| format!("{} parse error: {}", key, e))
        }

        let device: String = kv(&mut it, "DEVICE")?;
        let lot: String = kv(&mut it, "LOT")?;
        let wafer: String = kv(&mut it, "WAFER")?;
        // Optional fields:
        let fnloc = it
            .clone()
            .next()
            .filter(|l| l.starts_with("FNLOC"))
            .map(|_| kv(&mut it, "FNLOC"))
            .transpose()?;
        let row_ct = kv(&mut it, "ROWCT")?;
        let col_ct = kv(&mut it, "COLCT")?;
        let bcequ = it
            .clone()
            .next()
            .filter(|l| l.starts_with("BCEQU"))
            .map(|_| kv(&mut it, "BCEQU"))
            .transpose()?;
        let refpx = kv(&mut it, "REFPX")?;
        let refpy = kv(&mut it, "REFPY")?;
        let dut_ms: String = kv(&mut it, "DUTMS")?;
        let x_dies = kv(&mut it, "XDIES")?;
        let y_dies = kv(&mut it, "YDIES")?;

        // Collect RowData lines: either "RowData:" alone then tokens next line,
        // or "RowData: <tokens...>" on the same line (handle both)
        let mut raw: Vec<String> = Vec::with_capacity(row_ct as usize);
        let mut grid: Vec<Vec<HexCell>> = Vec::with_capacity(row_ct as usize);

        while let Some(line) = it.next() {
            if !line.starts_with("RowData") {
                continue;
            }
            // grab text after "RowData:"
            let after = line.splitn(2, ':').nth(1).unwrap_or("").trim();
            let row_text = if after.is_empty() {
                // RowData: on its own line → next non-empty line has tokens
                match it.next() {
                    Some(next) => next.trim(),
                    None => return Err("RowData without content".into()),
                }
            } else {
                after
            }
            .to_string();

            // Parse tokens
            let tokens = row_text.split_whitespace().collect::<Vec<_>>();
            let mut row_cells = Vec::with_capacity(col_ct as usize);
            for tok in tokens {
                row_cells.push(parse_hex_cell(tok)?);
            }
            // Some files pad or truncate; normalize to col_ct
            row_cells.resize_with(col_ct as usize, || HexCell(None));

            raw.push(row_text);
            grid.push(row_cells);
        }

        if grid.len() as u32 != row_ct {
            // allow files that omit leading/trailing empty rows; optionally relax
            // here we just pad to expected row count
            while grid.len() < row_ct as usize {
                raw.push(String::new());
                grid.push(vec![HexCell(None); col_ct as usize]);
            }
        }

        // Build flattened dies with centered coordinates (skip None / `--`)
        let mut dies: Vec<AsciiDie> = Vec::new();
        let (col_ct_i, row_ct_i) = (col_ct as i32, row_ct as i32);
        for (r, row) in grid.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                if let Some(v) = cell.0 {
                    let (x, y) = center_xy(col_ct_i, row_ct_i, c as i32, r as i32);
                    dies.push(AsciiDie {
                        x,
                        y,
                        bin: BinValue::Number(v as i32),
                    });
                }
            }
        }

        Ok(HexMapData {
            header: HexHeader {
                device,
                lot,
                wafer,
                fnloc,
                row_ct,
                col_ct,
                bcequ,
                refpx,
                refpy,
                dut_ms,
                x_dies,
                y_dies,
            },
            map: HexMap { raw, grid, dies },
        })
    }
}
