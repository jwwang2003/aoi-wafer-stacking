// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod crypto;
mod file;
mod parser;
mod wafer;
mod commands;

use file::file_lock;
use tauri::{RunEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = run_once() {
        eprintln!("❌ App failed to start: {err}");
        std::process::exit(1);
    }
}

fn run_once() -> Result<(), tauri::Error> {
    // Keep this in sync with your sql/init.sql
    let migrations: Vec<Migration> = vec![Migration {
        version: 1,
        description: "Create initial tables",
        sql: include_str!("../../sql/init.sql"),
        kind: MigrationKind::Up,
    }];

    println!("🐛 Preparing to initialize SQL plugin...");
    for m in &migrations {
        println!(
            "📦 Migration v{} - {} (SQL length: {})",
            m.version,
            m.description,
            m.sql.len()
        );
    }

    println!("🔨 Building SQL plugin with target: sqlite:data.db");

    let sql_plugin = tauri_plugin_sql::Builder::new()
        .add_migrations("sqlite:data.db", migrations)
        .build();

    println!("✅ SQL plugin build complete, attaching to app...");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(sql_plugin)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // File IO related
            file_lock::lock_file,
            file_lock::unlock_file,
            // Commands
            commands::rust_read_file_stat_batch,
            commands::rust_read_dir,
            // Cryptography
            commands::rust_sha1,
            commands::rust_sha256,
            // Excel file parsing methods
            commands::rust_parse_product_mapping_xls,
            commands::rust_parse_product_xls,
            commands::rust_parse_substrate_defect_xls,
            // Wafer parsing methods
            commands::rust_parse_wafer,
            commands::rust_parse_wafer_bin,
            commands::rust_parse_wafer_map_data,
            commands::rust_export_wafer,
            commands::rust_print_wafer,
            commands::rust_export_wafer_bin,
            commands::rust_print_wafer_bin,
            commands::rust_export_wafer_map_data,
            commands::rust_print_wafer_map_data,
            commands::rust_export_wafer_hex,
            commands::rust_print_wafer_hex
        ])
        .build(tauri::generate_context!())?;

    println!("🚀 App built successfully, entering run loop...");

    app.run(move |_app_handle, event| {
        match &event {
            RunEvent::ExitRequested { .. } => {
                println!("🧹 Exit requested, cleaning up file locks...");
                file_lock::clear_all_locks();
                println!("👋 Thank you for using our software!");
            }
            _ => {}
        }
    });

    Ok(())
}
