// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                // Les clics de souris passent à travers pour ne pas gêner en jeu !
                let _ = main_window.set_ignore_cursor_events(true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application BordelBoxEasy");
}
