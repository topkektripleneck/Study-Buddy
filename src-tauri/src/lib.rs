mod commands;
mod error;
mod metrics;
mod models;
mod state;
mod storage;
mod timer;
mod windows;

use std::sync::Arc;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

use state::AppState;
use storage::StorageEngine;
use timer::TimerActor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = windows::WindowManager::focus(app, "main");
        }))
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("study-buddy");

            let storage = Arc::new(
                StorageEngine::new(data_dir).map_err(|e| e.to_string())?,
            );
            let config = storage
                .read_config()
                .map_err(|e| e.to_string())?;

            let _ = storage.maybe_daily_backup();
            // Recompute on launch so a day rollover resets today's numbers even
            // if the app was left running across midnight.
            let _ = metrics::recalculate(&storage);

            let timer = TimerActor::new(storage.clone(), app.handle().clone(), config);

            app.manage(AppState {
                storage,
                timer,
                revision: parking_lot::RwLock::new(0),
            });

            let show_i = MenuItem::with_id(app, "show", "Show Workspace", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let hud_i = MenuItem::with_id(app, "toggle_hud", "Toggle HUD", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let cal_i =
                MenuItem::with_id(app, "toggle_calendar", "Toggle Calendar", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let menu = Menu::with_items(app, &[&show_i, &hud_i, &cal_i, &quit_i])
                .map_err(|e| e.to_string())?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Study Buddy")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        let _ = windows::WindowManager::focus(app, "main");
                    }
                    "toggle_hud" => {
                        let _ = commands::toggle_window_from_tray(app, "hud");
                    }
                    "toggle_calendar" => {
                        let _ = commands::toggle_window_from_tray(app, "calendar");
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)
                .map_err(|e| e.to_string())?;

            windows::WindowManager::validate_window_positions(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window_open,
            commands::window_close,
            commands::window_is_open,
            commands::window_toggle,
            commands::storage_open_data_dir,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_toggle_done,
            commands::task_delete,
            commands::matrix_get,
            commands::matrix_set_quadrant,
            commands::matrix_remove_item,
            commands::calendar_list,
            commands::calendar_save_block,
            commands::calendar_delete_block,
            commands::metrics_get,
            commands::activity_daily_totals,
            commands::config_get,
            commands::config_save,
            commands::layout_get,
            commands::layout_save,
            commands::timer_subscribe,
            commands::timer_get,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_reset,
            commands::timer_skip_phase,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
