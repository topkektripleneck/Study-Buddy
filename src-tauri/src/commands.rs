use tauri::Emitter;
use tauri::State;

use crate::error::AppError;
use crate::models::{
    AppConfig, CalendarTimeBlock, ConsistencyMetric, EisenhowerMatrixFile, TaskItem,
    TimerTickPayload, WidgetLayout, new_uuid, now_iso,
};
use crate::state::AppState;
use crate::windows::WindowManager;

#[tauri::command]
pub fn window_open(app: tauri::AppHandle, label: String) -> Result<(), String> {
    WindowManager::open(&app, &label).map_err(|e| e.to_string())?;
    emit_window_visibility(&app, &label, true);
    Ok(())
}

#[tauri::command]
pub fn window_close(app: tauri::AppHandle, label: String) -> Result<(), String> {
    WindowManager::close(&app, &label).map_err(|e| e.to_string())?;
    emit_window_visibility(&app, &label, false);
    Ok(())
}

#[tauri::command]
pub fn window_is_open(app: tauri::AppHandle, label: String) -> Result<bool, String> {
    Ok(WindowManager::is_open(&app, &label))
}

#[tauri::command]
pub fn window_toggle(app: tauri::AppHandle, label: String) -> Result<bool, String> {
    toggle_window_from_tray(&app, &label).map_err(|e| e.to_string())
}

pub fn toggle_window_from_tray(app: &tauri::AppHandle, label: &str) -> Result<bool, AppError> {
    let open = WindowManager::toggle(app, label)?;
    emit_window_visibility(app, label, open);
    Ok(open)
}

fn emit_window_visibility(app: &tauri::AppHandle, label: &str, open: bool) {
    let _ = app.emit(
        "window:visibility",
        serde_json::json!({ "label": label, "open": open }),
    );
}

#[tauri::command]
pub fn storage_get_data_dir(state: State<AppState>) -> Result<String, String> {
    Ok(state
        .storage
        .root()
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn tasks_list(state: State<AppState>) -> Result<Vec<TaskItem>, String> {
    state.storage.read_tasks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_create(state: State<AppState>, title: String) -> Result<TaskItem, String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    let order = tasks.len() as i32;
    let task = TaskItem {
        id: new_uuid(),
        parent_id: None,
        order,
        title,
        notes: None,
        status: crate::models::TaskStatus::Open,
        priority: crate::models::Priority::Normal,
        quadrant: None,
        tags: vec![],
        estimate_minutes: None,
        actual_minutes: 0,
        due_at: None,
        defer_until: None,
        linked_block_ids: vec![],
        checklist: vec![],
        created_at: now_iso(),
        updated_at: now_iso(),
        completed_at: None,
    };
    tasks.push(task.clone());
    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "tasks:changed",
        serde_json::json!({ "kind": "created", "taskIds": [task.id.clone()], "revision": rev }),
    );
    Ok(task)
}

#[tauri::command]
pub fn task_update(state: State<AppState>, task: TaskItem) -> Result<TaskItem, String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    let idx = tasks
        .iter()
        .position(|t| t.id == task.id)
        .ok_or_else(|| AppError::NotFound(task.id.clone()).to_string())?;
    let mut updated = task;
    updated.updated_at = now_iso();
    tasks[idx] = updated.clone();
    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "tasks:changed",
        serde_json::json!({ "kind": "updated", "taskIds": [updated.id.clone()], "revision": rev }),
    );
    Ok(updated)
}

#[tauri::command]
pub fn matrix_get(state: State<AppState>) -> Result<EisenhowerMatrixFile, String> {
    state.storage.read_matrix().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn matrix_save(state: State<AppState>, matrix: EisenhowerMatrixFile) -> Result<(), String> {
    state.storage.write_matrix(&matrix).map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "matrix:changed",
        serde_json::json!({ "kind": "updated", "revision": rev }),
    );
    Ok(())
}

#[tauri::command]
pub fn calendar_list(state: State<AppState>) -> Result<Vec<CalendarTimeBlock>, String> {
    state.storage.read_calendar().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn calendar_save_block(
    state: State<AppState>,
    block: CalendarTimeBlock,
) -> Result<CalendarTimeBlock, String> {
    let mut blocks = state.storage.read_calendar().map_err(|e| e.to_string())?;
    if let Some(idx) = blocks.iter().position(|b| b.id == block.id) {
        blocks[idx] = block.clone();
    } else {
        blocks.push(block.clone());
    }
    state
        .storage
        .write_calendar(&blocks)
        .map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "calendar:changed",
        serde_json::json!({ "kind": "updated", "blockIds": [block.id.clone()], "revision": rev }),
    );
    Ok(block)
}

#[tauri::command]
pub fn calendar_delete_block(state: State<AppState>, block_id: String) -> Result<(), String> {
    let mut blocks = state.storage.read_calendar().map_err(|e| e.to_string())?;
    let before = blocks.len();
    blocks.retain(|b| b.id != block_id);
    if blocks.len() == before {
        return Err(AppError::NotFound(block_id.clone()).to_string());
    }
    state
        .storage
        .write_calendar(&blocks)
        .map_err(|e| e.to_string())?;

    // Unlink tasks pointing at this block
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    let mut changed = false;
    for task in &mut tasks {
        let before = task.linked_block_ids.len();
        task.linked_block_ids.retain(|id| id != &block_id);
        if task.linked_block_ids.len() != before {
            task.updated_at = now_iso();
            changed = true;
        }
    }
    if changed {
        state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    }

    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "calendar:changed",
        serde_json::json!({ "kind": "deleted", "blockIds": [block_id], "revision": rev }),
    );
    Ok(())
}

#[tauri::command]
pub fn metrics_get(state: State<AppState>) -> Result<ConsistencyMetric, String> {
    state.storage.read_metrics().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_get(state: State<AppState>) -> Result<AppConfig, String> {
    state.storage.read_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn config_save(state: State<AppState>, config: AppConfig) -> Result<AppConfig, String> {
    state.timer.update_config(config.clone());
    state
        .storage
        .write_config(&config)
        .map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "config:changed",
        serde_json::json!({ "patchedKeys": ["*"], "revision": rev }),
    );
    Ok(config)
}

#[tauri::command]
pub fn layout_get(state: State<AppState>) -> Result<WidgetLayout, String> {
    state.storage.read_layout().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn layout_save(state: State<AppState>, layout: WidgetLayout) -> Result<(), String> {
    state.storage.write_layout(&layout).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_subscribe(
    state: State<AppState>,
    channel: tauri::ipc::Channel<TimerTickPayload>,
) -> Result<(), String> {
    state.timer.subscribe(channel);
    Ok(())
}

#[tauri::command]
pub fn timer_get(state: State<AppState>) -> Result<Option<TimerTickPayload>, String> {
    Ok(state.timer.get_tick())
}

#[tauri::command]
pub fn timer_start(
    state: State<AppState>,
    protocol: Option<String>,
    duration_minutes: Option<u32>,
) -> Result<TimerTickPayload, String> {
    state
        .timer
        .start(protocol, duration_minutes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_pause(state: State<AppState>) -> Result<TimerTickPayload, String> {
    state.timer.pause().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_resume(state: State<AppState>) -> Result<TimerTickPayload, String> {
    state.timer.resume().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_reset(state: State<AppState>) -> Result<(), String> {
    state.timer.reset().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_skip_phase(state: State<AppState>) -> Result<TimerTickPayload, String> {
    state.timer.skip_phase().map_err(|e| e.to_string())
}
