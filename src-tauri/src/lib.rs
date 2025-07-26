// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod file_handler;
mod parser;
mod wafer;

use file_handler::file_lock;

#[allow(unused)]
use tauri::{Manager, RunEvent};

/**
 * Developer notes:
 * - Reference for lib.rs (https://github.com/tauri-apps/tauri/blob/dev/examples/api/src-tauri/src/lib.rs#L146-L152)
 */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_lock::lock_file,
            file_lock::unlock_file,
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
            },
            _ => (),
        }
    });
}
