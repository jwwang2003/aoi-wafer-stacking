// src/types/wafer.ts

export interface DefectRecord {
  "No.": number;
  "X(mm)": number;
  "Y(mm)": number;
  "W(um)": number;
  "H(um)": number;
  "Area(um2)": number;
  Class: string;
  Contrast: number;
  Channel: string;
}

export interface Wafer {
  operator: string;
  device: string;
  lot_id: string;
  wafer_id: string;
  meas_time: string;
  gross_die: number;
  pass_die: number;
  fail_die: number;
  total_yield: number;
  notch: string;
  ascii_map: string[];
}

export interface WaferMap {
  wafer_type: number;
  dut: number;
  mode: number;
  product: string;
  wafer_lots: string;
  wafer_no: string;
  wafer_size: number;
  index_x: number;
  index_y: number;
  wafer_map: Array<[number, number, number, number]>;
}

export interface WaferMapEx {
  device_name: string;
  lot_no: string;
  wafer_id: string;
  wafer_size: string;
  dice_size_x: number;
  dice_size_y: number;
  flat_notch: string;
  map_columns: number;
  map_rows: number;
  total_tested: number;
  total_pass: number;
  total_fail: number;
  yield_percent: number;
  ascii_map: string[];
}
