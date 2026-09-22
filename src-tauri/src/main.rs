// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                // Les clics de souris passent à travers pour ne pas gêner en jeu !
                let _ = main_window.set_ignore_cursor_events(true);
                let _ = main_window.set_decorations(false);
                let _ = main_window.set_shadow(false);
            }

            // 1. Sous-menu pour régler la taille de l'overlay (LiveChat)
            let size_75 = MenuItem::with_id(app, "scale_75", "Petite (75%)", true, None::<&str>)?;
            let size_100 = MenuItem::with_id(app, "scale_100", "Normale (100%)", true, None::<&str>)?;
            let size_125 = MenuItem::with_id(app, "scale_125", "Grande (125%)", true, None::<&str>)?;
            let size_150 = MenuItem::with_id(app, "scale_150", "Très grande (150%)", true, None::<&str>)?;

            let size_submenu = Submenu::with_items(
                app,
                "📏 Taille de l'overlay",
                true,
                &[&size_75, &size_100, &size_125, &size_150],
            )?;

            // 2. Options supplémentaires
            let server_item = MenuItem::with_id(app, "config_server", "🌐 Configurer le serveur...", true, None::<&str>)?;
            let test_item = MenuItem::with_id(app, "test_card", "🎯 Tester une carte", true, None::<&str>)?;
            let reload_item = MenuItem::with_id(app, "reload", "🔄 Recharger l'overlay", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "❌ Quitter BordelBox", true, None::<&str>)?;

            // 3. Construction du menu contextuel (clic droit)
            let menu = Menu::with_items(
                app,
                &[&size_submenu, &server_item, &test_item, &reload_item, &sep, &quit_item],
            )?;

            // 4. Initialisation de l'icône dans la barre des tâches (System Tray)
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false) // Menu uniquement au clic droit
                .tooltip("BordelBoxEasy - Overlay")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "quit" => app.exit(0),
                        "scale_75" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("if (window.setOverlayScale) window.setOverlayScale(0.75);");
                            }
                            let _ = app.emit("set_overlay_scale", 0.75);
                        }
                        "scale_100" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("if (window.setOverlayScale) window.setOverlayScale(1.0);");
                            }
                            let _ = app.emit("set_overlay_scale", 1.0);
                        }
                        "scale_125" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("if (window.setOverlayScale) window.setOverlayScale(1.25);");
                            }
                            let _ = app.emit("set_overlay_scale", 1.25);
                        }
                        "scale_150" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("if (window.setOverlayScale) window.setOverlayScale(1.5);");
                            }
                            let _ = app.emit("set_overlay_scale", 1.5);
                        }
                        "config_server" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                                let _ = window.eval("if (window.configureServerUrl) window.configureServerUrl();");
                            }
                        }
                        "test_card" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("if (window.triggerTestCard) window.triggerTestCard();");
                            }
                            let _ = app.emit("trigger_test_overlay", ());
                        }
                        "reload" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.eval("window.location.reload()");
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application BordelBoxEasy");
}
