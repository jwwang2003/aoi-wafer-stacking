// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod file;
mod parser;
mod wafer;

mod commands;

use file::file_lock;

#[allow(unused)]
use tauri::{Manager, RunEvent};
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

/**
 * Developer notes:
 * - Reference for lib.rs (https://github.com/tauri-apps/tauri/blob/dev/examples/api/src-tauri/src/lib.rs#L146-L152)
 */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations: Vec<Migration> = vec![Migration {
        version: 1,
        description: "Create initial tables",
        sql: include_str!("../../sql/init.sql"),
        kind: MigrationKind::Up,
    }];

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_lock::lock_file,
            file_lock::unlock_file,
            commands::get_file_batch_stat
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(move |_app_handle, _event| {
        match &_event {
            #[allow(unused_variables)]
            RunEvent::ExitRequested { api, code, .. } => {
                // Logic can also be implemented here to keep the app life cycle
                // alive so that it stays in the system tray. In our case, there
                // is no need for that. Therefore, the application will exit after
                // an exit request is initiated.

                // Start performing exit logic
                println!("Applicaiton closing...");

                // Start performing cleanup logic
                println!("Performing cleanup..;");
                file_lock::clear_all_locks();
            }
            _ => (),
        }
    });
}
