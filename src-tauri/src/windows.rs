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
                HUD_WIDTH,
                HUD_HEIGHT,
                "#/hud",
                WindowProfile::Hud,
            ),
            other => Err(AppError::Window(format!("Unknown window label: {other}"))),
        }
    }

    pub fn toggle(app: &AppHandle, label: &str) -> Result<bool, AppError> {
        if Self::is_open(app, label) {
            Self::close(app, label)?;
            Ok(false)
        } else {
            Self::open(app, label)?;
            Ok(true)
        }
    }

    pub fn close(app: &AppHandle, label: &str) -> Result<(), AppError> {
        if label == "main" {
            return Err(AppError::Window("the main window cannot be closed".into()));
        }
        if let Some(window) = app.get_webview_window(label) {
            window
                .destroy()
                .map_err(|e| AppError::Window(e.to_string()))?;
        }
        Ok(())
    }

    pub fn is_open(app: &AppHandle, label: &str) -> bool {
        app.get_webview_window(label).is_some()
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

        let window = builder
            .build()
            .map_err(|e| AppError::Window(e.to_string()))?;

        // The HUD is borderless and skips the taskbar, so it must land somewhere
        // predictable or it looks like nothing opened at all.
        if matches!(profile, WindowProfile::Hud) {
            park_top_right(app, &window, width);
        }

        Ok(())
    }
}

const HUD_WIDTH: f64 = 420.0;
const HUD_HEIGHT: f64 = 96.0;

enum WindowProfile {
    Calendar,
    Hud,
}

fn park_top_right(app: &AppHandle, window: &tauri::WebviewWindow, logical_width: f64) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let size = monitor.size();
    let margin = (24.0 * scale) as i32;
    let width = (logical_width * scale) as i32;

    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x: origin.x + size.width as i32 - width - margin,
        y: origin.y + margin,
    }));
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
