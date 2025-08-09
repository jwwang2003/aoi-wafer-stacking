use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::Write;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BinValue {
    Number(i32),
    Special(char), // e.g. 'S', '*', 'A', 'B'
}

#[derive(Debug, Serialize)]
pub struct BinCountEntry {
    pub bin: u32,
    pub count: u32,
}

// Two types of die structures are defined here,
// the default is AsciiDie, WaferMap uses the Die

#[derive(Debug, Serialize)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
/// Used by default when reading MAPs
pub struct AsciiDie {
    pub x: i32,
    pub y: i32,
    pub bin: BinValue,
}

/// Holds both the raw map text and the parsed dies.
#[derive(Debug, Serialize)]
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
#[derive(Debug, Serialize)]
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

#[derive(Debug, Serialize)]
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
        writeln!(out, "\n# Raw ASCII Map #").unwrap();
        for row in &self.map.raw {
            writeln!(out, "{}", row).unwrap();
        }

        // --- Parsed dies ---
        writeln!(out, "\n# Parsed Dies #").unwrap();
        for die in &self.map.dies {
            writeln!(out, "Die (x={}, y={}) -> {:?}", die.x, die.y, die.bin).unwrap();
        }

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

#[derive(Debug, Serialize)]
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
        writeln!(out, "\n# Wafer Map #").unwrap();
        for die in &self.map {
            writeln!(out, "Die (x={}, y={}) -> {:?}", die.x, die.y, die.bin).unwrap();
        }

        // --- Bin counts ---
        writeln!(out, "\n# Bin Counts #").unwrap();
        for entry in &self.bins {
            writeln!(out, "Bin {:>3} {}", entry.bin, entry.count).unwrap();
        }

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
