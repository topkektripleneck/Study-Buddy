mod calendar;
mod commands;
mod error;
mod ics;
mod metrics;
mod models;
mod notify;
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["hud", "toast"])
                .build(),
        )
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

            let timer = TimerActor::new(storage.clone(), app.handle().clone(), config.clone());

            if config.autostart {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().enable();
            }

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
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::toggle_window_from_tray(&app, "hud");
                        });
                    }
                    "toggle_calendar" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = commands::toggle_window_from_tray(&app, "calendar");
                        });
                    }
                    "quit" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            state.timer.flush();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)
                .map_err(|e| e.to_string())?;

            windows::WindowManager::validate_window_positions(app.handle());
            commands::sync_auxiliary_window_visibility(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window_open,
            commands::window_close,
            commands::window_is_open,
            commands::window_toggle,
            commands::notify_take_pending,
            commands::notify_test,
            commands::storage_open_data_dir,
            commands::storage_export_zip,
            commands::storage_import_zip,
            commands::tasks_list,
            commands::task_create,
            commands::task_update,
            commands::task_toggle_done,
            commands::task_delete,
            commands::matrix_get,
            commands::matrix_set_quadrant,
            commands::matrix_move_item,
            commands::matrix_stage_for_calendar,
            commands::matrix_remove_item,
            commands::matrix_update_item,
            commands::calendar_list,
            commands::calendar_save_block,
            commands::calendar_import_ics,
            commands::calendar_delete_block,
            commands::metrics_get,
            commands::metrics_set_target,
            commands::activity_daily_totals,
            commands::config_get,
            commands::config_save,
            commands::layout_get,
            commands::layout_save,
            commands::data_reset,
            commands::energy_recent,
            commands::energy_log,
            commands::journal_list,
            commands::journal_save,
            commands::journal_delete,
            commands::chime_import,
            commands::timer_subscribe,
            commands::timer_get,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_reset,
            commands::timer_skip_phase,
            commands::timer_get_pending_restore,
            commands::timer_confirm_restore,
            commands::timer_discard_restore,
            commands::timer_ack_suspend,
            commands::task_reorder,
            commands::autostart_enable,
            commands::autostart_disable,
            commands::autostart_is_enabled,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(on_run_event);
}

fn on_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
        if let Some(state) = app.try_state::<AppState>() {
            state.timer.flush();
        }
    }
}
