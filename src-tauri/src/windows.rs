use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppError;

pub struct WindowManager;

impl WindowManager {
    pub fn open(app: &AppHandle, label: &str) -> Result<(), AppError> {
        match label {
            "main" => Self::focus(app, "main"),
            "calendar" => Self::open_or_create(
                app,
                "calendar",
                "Study Buddy - Calendar",
                1040.0,
                760.0,
                "#/calendar",
                WindowProfile::Calendar,
            ),
            "hud" => Self::open_or_create(
                app,
                "hud",
                "Study Buddy - HUD",
                360.0,
                64.0,
                "#/hud",
                WindowProfile::Hud,
            ),
            other => Err(AppError::Window(format!("Unknown window label: {other}"))),
        }
    }

    pub fn focus(app: &AppHandle, label: &str) -> Result<(), AppError> {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| AppError::Window(format!("Window '{label}' is not available")))?;
        window.show().map_err(|e| AppError::Window(e.to_string()))?;
        window
            .set_focus()
            .map_err(|e| AppError::Window(e.to_string()))?;
        Ok(())
    }

    pub fn validate_window_positions(app: &AppHandle) {
        let monitors = app.available_monitors().unwrap_or_default();
        if monitors.is_empty() {
            return;
        }

        for label in ["main", "calendar", "hud"] {
            if let Some(window) = app.get_webview_window(label) {
                if let Ok(pos) = window.outer_position() {
                    if !intersects_any_monitor(&monitors, pos.x, pos.y) {
                        if let Some(primary) = app.primary_monitor().ok().flatten() {
                            let size = primary.size();
                            let x = (size.width as i32 / 2).saturating_sub(200);
                            let y = (size.height as i32 / 2).saturating_sub(150);
                            let _ = window.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition { x, y },
                            ));
                        }
                    }
                }
            }
        }
    }

    fn open_or_create(
        app: &AppHandle,
        label: &str,
        title: &str,
        width: f64,
        height: f64,
        hash: &str,
        profile: WindowProfile,
    ) -> Result<(), AppError> {
        if app.get_webview_window(label).is_some() {
            return Self::focus(app, label);
        }

        let url = WebviewUrl::App(format!("index.html{hash}").into());
        let mut builder = WebviewWindowBuilder::new(app, label, url)
            .title(title)
            .inner_size(width, height);

        match profile {
            WindowProfile::Calendar => {
                builder = builder.decorations(true).resizable(true);
            }
            WindowProfile::Hud => {
                builder = builder
                    .decorations(false)
                    .resizable(false)
                    .always_on_top(true)
                    .skip_taskbar(true);
            }
        }

        builder
            .build()
            .map_err(|e| AppError::Window(e.to_string()))?;
        Ok(())
    }
}

enum WindowProfile {
    Calendar,
    Hud,
}

fn intersects_any_monitor(monitors: &[tauri::Monitor], x: i32, y: i32) -> bool {
    monitors.iter().any(|m| {
        let pos = m.position();
        let size = m.size();
        x >= pos.x
            && y >= pos.y
            && x < pos.x + size.width as i32
            && y < pos.y + size.height as i32
    })
}
