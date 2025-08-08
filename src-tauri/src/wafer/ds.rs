use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Die {
    pub x: i32,
    pub y: i32,
    pub bin: i32,
    pub reserved: i32,
}

impl From<[i32; 4]> for Die {
    fn from(q: [i32; 4]) -> Self {
        Self { x: q[0], y: q[1], bin: q[2], reserved: q[3] }
    }
}

/// Wafer defect list data structure
#[derive(Debug, Deserialize, Serialize)]
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
    pub ascii_map: Vec<String>,
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
        for line in &self.ascii_map {
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
            // strip trailing `%`
            let num = ty
                .trim_end_matches('%')
                .parse::<f64>()
                .map_err(|e| format!("Invalid Total Yield `{}`: {}", ty, e))?;
            num
        };

        // Next line is the notch orientation (no colon)
        let notch = it
            .next()
            .ok_or_else(|| "Missing notch orientation".to_string())?
            .trim()
            .to_string();

        // The rest is the ASCII map
        let ascii_map: Vec<String> = it.map(|s| s.clone()).collect();

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
            ascii_map,
        })
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WaferMap {
    pub wafer_type: u32,
    pub dut: u32,
    pub mode: u32,
    pub product: String,
    pub wafer_lots: String,
    pub wafer_no: String,
    pub wafer_size: f64,
    pub index_x: f64,
    pub index_y: f64,
    pub wafer_map: Vec<[i32; 4]>,
    pub bins: HashMap<u32, u32>,
}

impl WaferMap {
    pub fn to_string(&self) -> String {
        let mut out = String::new();
        writeln!(out, "WaferType: {}", self.wafer_type).unwrap();
        writeln!(out, "DUT:{}", self.dut).unwrap();
        writeln!(out, "Mode:{}", self.mode).unwrap();
        writeln!(out, "Product:{}", self.product).unwrap();
        writeln!(out, "Wafer Lots:{}", self.wafer_lots).unwrap();
        writeln!(out, "Wafer No:{}", self.wafer_no).unwrap();
        writeln!(out, "Wafer Size:{}", self.wafer_size).unwrap();
        writeln!(out, "Index X:{}", self.index_x).unwrap();
        writeln!(out, "Index Y:{}", self.index_y).unwrap();
        writeln!(out).unwrap(); // blank line before map

        for quad in &self.wafer_map {
            writeln!(out, "{} {} {} {}", quad[0], quad[1], quad[2], quad[3]).unwrap();
        }
        writeln!(out).unwrap();

        // serialize bins in ascending order of bin number
        let mut keys: Vec<_> = self.bins.keys().cloned().collect();
        keys.sort_unstable();
        for bin in keys {
            writeln!(out, "Bin {:>3} {}", bin, self.bins[&bin]).unwrap();
        }
        writeln!(out, "## END ##").unwrap();

        out
    }

    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        let mut it = lines.iter().map(|s| s.trim()).filter(|l| !l.is_empty());

        // helper to parse T: FromStr from a "Key: value" line
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

        // Skip until “[MAP]” marker
        while let Some(line) = it.next() {
            if line.contains("[MAP]") {
                break;
            }
        }

        // Parse the 4-integer map entries
        let mut wafer_map = Vec::new();
        while let Some(l) = it.next() {
            if l.starts_with("Total Prober") || l.starts_with("Bin ") || l.starts_with("## END ##")
            {
                // once we hit totals or bins or the end marker, break out of map parsing
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
            wafer_map.push([nums[0], nums[1], nums[2], nums[3]]);
        }

        // Now parse all the “Bin N   M” entries until “## END ##”
        let mut bins = HashMap::new();
        for l in it {
            if l.starts_with("## END ##") {
                break;
            }
            if l.starts_with("Bin") {
                // line may contain many comma-separated bins
                for seg in l.split(',') {
                    let seg = seg.trim();
                    if let Some(rest) = seg.strip_prefix("Bin") {
                        let mut parts = rest.split_whitespace();
                        if let (Some(id_s), Some(cnt_s)) = (parts.next(), parts.next()) {
                            let id = id_s
                                .parse::<u32>()
                                .map_err(|e| format!("Bin id '{}' parse error: {}", id_s, e))?;
                            let cnt = cnt_s
                                .parse::<u32>()
                                .map_err(|e| format!("Bin count '{}' parse error: {}", cnt_s, e))?;
                            bins.insert(id, cnt);
                        }
                    }
                }
            }
        }

        Ok(WaferMap {
            wafer_type,
            dut,
            mode,
            product,
            wafer_lots,
            wafer_no,
            wafer_size,
            index_x,
            index_y,
            wafer_map,
            bins,
        })
    }
}

/// Wafer mapEx data structure (ex for extended?)
#[derive(Debug, Deserialize, Serialize)]
pub struct WaferMapEx {
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
    pub ascii_map: Vec<String>,
}

impl WaferMapEx {
    pub fn to_string(&self) -> String {
        let mut out = String::new();
        // align keys to 18 chars
        writeln!(out, "{:18}: {}", "Device Name", self.device_name).unwrap();
        writeln!(out, "{:18}: {}", "Lot No.", self.lot_no).unwrap();
        writeln!(out, "{:18}: {}", "Wafer ID", self.wafer_id).unwrap();
        writeln!(out, "{:18}: {}", "Wafer Size", self.wafer_size).unwrap();
        writeln!(out, "{:18}: {}", "Dice SizeX", self.dice_size_x).unwrap();
        writeln!(out, "{:18}: {}", "Dice SizeY", self.dice_size_y).unwrap();
        writeln!(out, "{:18}: {}", "Flat/Notch", self.flat_notch).unwrap();
        writeln!(out, "{:18}: {}", "Map Column", self.map_columns).unwrap();
        writeln!(out, "{:18}: {}", "Map Row", self.map_rows).unwrap();
        writeln!(out, "{:18}: {}", "Total Tested", self.total_tested).unwrap();
        writeln!(out, "{:18}: {}", "Total Pass", self.total_pass).unwrap();
        writeln!(out, "{:18}: {}", "Total Fail", self.total_fail).unwrap();
        writeln!(out, "{:18}: {:.2}%", "Yield", self.yield_percent).unwrap();
        writeln!(out).unwrap();
        writeln!(out, "ASCII Map").unwrap();
        for line in &self.ascii_map {
            writeln!(out, "{}", line).unwrap();
        }
        out
    }

    pub fn from_lines(lines: &[String]) -> Result<Self, String> {
        let mut it = lines.iter();

        // 1. Parse all header fields:
        let device_name = parse_kv(&mut it, pad18!(r"Device Name"))?;
        let lot_no = parse_kv(&mut it, pad18!(r"Lot No."))?;
        let wafer_id = parse_kv(&mut it, pad18!(r"Wafer ID"))?;
        let wafer_size = parse_kv(&mut it, pad18!(r"Wafer Size"))?; // keep as string, e.g. `6"`
        let dice_size_x = parse_kv(&mut it, pad18!(r"Dice SizeX"))?
            .parse::<f64>()
            .map_err(|e| format!("Invalid Dice SizeX: {}", e))?;
        let dice_size_y = parse_kv(&mut it, pad18!(r"Dice SizeY"))?
            .parse::<f64>()
            .map_err(|e| format!("Invalid Dice SizeY: {}", e))?;
        let flat_notch = parse_kv(&mut it, pad18!(r"Flat/Notch"))?;
        let map_columns = parse_kv(&mut it, pad18!(r"Map Column"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Map Column: {}", e))?;
        let map_rows = parse_kv(&mut it, pad18!(r"Map Row"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Map Row: {}", e))?;
        let total_tested = parse_kv(&mut it, pad18!(r"Total Tested"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Tested: {}", e))?;
        let total_pass = parse_kv(&mut it, pad18!(r"Total Pass"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Pass: {}", e))?;
        let total_fail = parse_kv(&mut it, pad18!(r"Total Fail"))?
            .parse::<u32>()
            .map_err(|e| format!("Invalid Total Fail: {}", e))?;
        let yield_percent = {
            let val = parse_kv(&mut it, pad18!(r"Yield"))?;
            let num = val
                .trim_end_matches('%')
                .parse::<f64>()
                .map_err(|e| format!("Invalid Yield: {}", e))?;
            num
        };

        // 2. The rest is the ASCII map, which may have blank lines:
        let mut ascii_map = Vec::new();
        while let Some(line) = it.next() {
            if line.trim().is_empty() {
                continue;
            }
            ascii_map.push(line.clone());
            break;
        }

        // 3. Now iterate the *same* iterator for the rest
        for line in it {
            if !line.trim().is_empty() {
                ascii_map.push(line.clone());
            }
        }
        if ascii_map.is_empty() {
            return Err("No map data found after headers".into());
        }

        Ok(WaferMapEx {
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
            ascii_map,
        })
    }
}
