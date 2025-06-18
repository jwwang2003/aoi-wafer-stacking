use calamine::{Reader, Xlsx, open_workbook};

pub fn main() {
  let mut excel: Xlsx<_> = open_workbook("file.xlsx").unwrap();
  if let Ok(r) = excel.worksheet_range("Sheet1") {
      for row in r.rows() {
          println!("row={:?}, row[0]={:?}", row, row[0]);
      }
  }
}