// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_handler;
mod parser;

fn main() {
    wafer_overlay_lib::run()
}
