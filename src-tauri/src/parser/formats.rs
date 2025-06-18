
// Device Name       : S1M032120B
// Lot No.           : B003332
// Wafer ID          : 01
// Wafer Size        : 6"
// Dice SizeX        : 4986.000
// Dice SizeY        : 3740.000
// Flat/Notch        : Down
// Map Column        : 28
// Map Row           : 37
// Total Tested      : 805
// Total Pass        : 724
// Total Fail        : 81
// Yield             : 89.94%
pub struct WaferMapEx {
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