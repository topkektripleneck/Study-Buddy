use std::collections::HashSet;
use std::sync::LazyLock;

use chrono::{DateTime, Timelike, Utc};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::models::{parse_iso, AppConfig, CalendarTimeBlock, ConsistencyMetric, TimerPhase};

static FIRED_BLOCK_KEYS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

static FIRED_METRIC_KEYS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

static PENDING_TOASTS: LazyLock<Mutex<Vec<serde_json::Value>>> =
    LazyLock::new(|| Mutex::new(Vec::new()));

pub fn emit_notification(app: &AppHandle, config: &AppConfig, payload: serde_json::Value) {
    let focused = is_main_focused(app);
    let visible = is_main_visible(app);
    let hidden = is_main_hidden_or_minimized(app);

    if focused || visible {
        let _ = app.emit("notify:fired", payload.clone());
    }

    if !focused && !in_quiet_hours(config) {
        show_os_notification(app, &payload);
    }

    if hidden {
        let toast_open = crate::windows::WindowManager::is_open(app, "toast");
        if toast_open {
            let _ = app.emit("notify:fired", payload.clone());
        } else {
            PENDING_TOASTS.lock().push(payload);
        }
        spawn_toast_popup(app);
    }
}

pub fn send_test_notification(app: &AppHandle, config: &AppConfig) {
    emit_notification(
        app,
        config,
        serde_json::json!({
            "kind": "timer",
            "title": "Test notification",
            "body": "In-app when the workspace is open; OS toast when it is not focused.",
        }),
    );
}

fn show_os_notification(app: &AppHandle, payload: &serde_json::Value) {
    let _ = app
        .notification()
        .builder()
        .title(
            payload
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Study Buddy"),
        )
        .body(payload.get("body").and_then(|v| v.as_str()).unwrap_or(""))
        .show();
}

fn in_quiet_hours(config: &AppConfig) -> bool {
    if !config.notify_quiet_hours_enabled {
        return false;
    }
    let hour = chrono::Local::now().hour();
    let start = config.notify_quiet_start_hour.min(23);
    let end = config.notify_quiet_end_hour.min(23);
    if start == end {
        return true;
    }
    if start < end {
        hour >= start && hour < end
    } else {
        hour >= start || hour < end
    }
}

fn is_main_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}

fn is_main_visible(app: &AppHandle) -> bool {
    let Some(main) = app.get_webview_window("main") else {
        return false;
    };
    main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false)
}

fn is_main_hidden_or_minimized(app: &AppHandle) -> bool {
    !is_main_visible(app)
}

fn spawn_toast_popup(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::windows::WindowManager::show_toast_popup(&app);
    });
}

pub fn take_pending_toasts() -> Vec<serde_json::Value> {
    PENDING_TOASTS.lock().drain(..).collect()
}

pub fn notify_timer_phase(app: &AppHandle, config: &AppConfig, from: TimerPhase, to: TimerPhase) {
    if !config.notify_timer {
        return;
    }
    if to == TimerPhase::Stopwatch || from == TimerPhase::Stopwatch {
        return;
    }

    let (title, body) = match (from, to) {
        (TimerPhase::Focus, TimerPhase::ShortBreak) => {
            ("Focus session complete", "Take a short break — stretch or breathe.")
        }
        (TimerPhase::Focus, TimerPhase::LongBreak) => {
            ("Focus session complete", "Long break time. Step away from the desk.")
        }
        (TimerPhase::ShortBreak | TimerPhase::LongBreak, TimerPhase::Focus) => {
            ("Break finished", "Next focus block is ready when you are.")
        }
        _ => return,
    };

    emit_notification(
        app,
        config,
        serde_json::json!({
            "kind": "timer",
            "title": title,
            "body": body,
            "from": from,
            "to": to,
        }),
    );
}

fn fire_metric_once(key: String) -> bool {
    FIRED_METRIC_KEYS.lock().insert(key)
}

/// Daily-target and streak-at-risk nudges — at most once per local day each.
pub fn poll_metrics_notifications(
    app: &AppHandle,
    config: &AppConfig,
    metric: &ConsistencyMetric,
) {
    if !config.notify_timer {
        return;
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    if metric.today_completion_percent >= 100 {
        let key = format!("target:{today}");
        if fire_metric_once(key) {
            emit_notification(
                app,
                config,
                serde_json::json!({
                    "kind": "metrics",
                    "title": "Daily target reached",
                    "body": format!(
                        "Nice — {} minutes of focus logged today.",
                        metric.daily_target_minutes
                    ),
                }),
            );
        }
    }

    let hour = chrono::Local::now().hour();
    if hour >= 18
        && metric.current_streak_days > 0
        && metric.today_completion_percent < 100
    {
        let key = format!("streak-risk:{today}");
        if fire_metric_once(key) {
            let target_ms = metric.daily_target_minutes as u64 * 60_000;
            let remaining_min = target_ms
                .saturating_sub(metric.today_focus_ms)
                .div_ceil(60_000);
            emit_notification(
                app,
                config,
                serde_json::json!({
                    "kind": "metrics",
                    "title": "Streak at risk",
                    "body": format!(
                        "~{} min of focus left to keep your {}-day streak.",
                        remaining_min.max(1),
                        metric.current_streak_days
                    ),
                }),
            );
        }
    }
}

/// Poll calendar blocks; fire start/end alerts once per block edge per app session.
pub fn poll_block_notifications(
    app: &AppHandle,
    config: &AppConfig,
    blocks: &[CalendarTimeBlock],
) {
    if !config.notify_blocks {
        return;
    }

    let now = Utc::now();
    let window = chrono::Duration::seconds(90);

    for block in blocks {
        if let Ok(start) = parse_iso(&block.start_at) {
            maybe_block_edge(app, config, block, "start", start, now, window);
        }
        if let Ok(end) = parse_iso(&block.end_at) {
            maybe_block_edge(app, config, block, "end", end, now, window);
        }
    }
}

fn maybe_block_edge(
    app: &AppHandle,
    config: &AppConfig,
    block: &CalendarTimeBlock,
    edge: &str,
    edge_at: DateTime<Utc>,
    now: DateTime<Utc>,
    window: chrono::Duration,
) {
    if now < edge_at || now - edge_at > window {
        return;
    }

    let key = format!("{}:{edge}:{}", block.id, edge_at.timestamp());
    let mut fired = FIRED_BLOCK_KEYS.lock();
    if !fired.insert(key) {
        return;
    }
    drop(fired);

    let kind_label = kind_label(block.kind);
    let (title, body) = if edge == "start" {
        (
            format!("Starting: {}", block.title),
            format!("{kind_label} block · beginning now"),
        )
    } else {
        (
            format!("Finished: {}", block.title),
            format!("{kind_label} block · time's up"),
        )
    };

    emit_notification(
        app,
        config,
        serde_json::json!({
            "kind": "block",
            "title": title,
            "body": body,
            "edge": edge,
            "blockId": block.id,
        }),
    );
}

fn kind_label(kind: crate::models::BlockKind) -> &'static str {
    use crate::models::BlockKind;
    match kind {
        BlockKind::Focus => "Focus",
        BlockKind::Break => "Break",
        BlockKind::Grounding => "Grounding",
        BlockKind::Admin => "Admin",
        BlockKind::Milestone => "Milestone",
        BlockKind::Buffer => "Buffer",
    }
}
