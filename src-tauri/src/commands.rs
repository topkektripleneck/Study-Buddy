use tauri::Emitter;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::{
    AppConfig, CalendarTimeBlock, ConsistencyMetric, DailyFocus, EisenhowerMatrixFile,
    EisenhowerQuadrant, EisenhowerQuadrantItem, TaskItem, TaskStatus, TimerTickPayload,
    WidgetLayout, new_uuid, now_iso,
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
pub fn storage_open_data_dir(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let path = state.storage.root().to_string_lossy().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
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
pub fn task_toggle_done(state: State<AppState>, task_id: String) -> Result<TaskItem, String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    let task = tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| AppError::NotFound(task_id.clone()).to_string())?;

    if task.status == TaskStatus::Done {
        task.status = TaskStatus::Open;
        task.completed_at = None;
    } else {
        task.status = TaskStatus::Done;
        task.completed_at = Some(now_iso());
    }
    task.updated_at = now_iso();
    let updated = task.clone();

    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "tasks:changed",
        serde_json::json!({ "kind": "updated", "taskIds": [updated.id.clone()], "revision": rev }),
    );
    Ok(updated)
}

/// Removes a task along with its subtasks, its matrix placement, and any
/// references to it from calendar blocks.
#[tauri::command]
pub fn task_delete(state: State<AppState>, task_id: String) -> Result<(), String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    if !tasks.iter().any(|t| t.id == task_id) {
        return Err(AppError::NotFound(task_id.clone()).to_string());
    }

    let doomed: Vec<String> = tasks
        .iter()
        .filter(|t| t.id == task_id || t.parent_id.as_deref() == Some(task_id.as_str()))
        .map(|t| t.id.clone())
        .collect();
    tasks.retain(|t| !doomed.contains(&t.id));
    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;

    let mut blocks = state.storage.read_calendar().map_err(|e| e.to_string())?;
    let mut blocks_changed = false;
    for block in &mut blocks {
        if block.task_id.as_ref().is_some_and(|id| doomed.contains(id)) {
            block.task_id = None;
            block.updated_at = now_iso();
            blocks_changed = true;
        }
    }
    if blocks_changed {
        state
            .storage
            .write_calendar(&blocks)
            .map_err(|e| e.to_string())?;
    }

    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let orphans: Vec<String> = matrix
        .items
        .iter()
        .filter(|item| doomed.contains(&item.task_id))
        .map(|item| item.id.clone())
        .collect();
    if !orphans.is_empty() {
        matrix.items.retain(|item| !orphans.contains(&item.id));
        for id in &orphans {
            matrix.quadrant_order.remove_everywhere(id);
        }
        state
            .storage
            .write_matrix(&matrix)
            .map_err(|e| e.to_string())?;
    }

    let rev = state.bump_revision();
    let app = state.timer.app();
    let _ = app.emit(
        "tasks:changed",
        serde_json::json!({ "kind": "deleted", "taskIds": doomed, "revision": rev }),
    );
    if blocks_changed {
        let _ = app.emit(
            "calendar:changed",
            serde_json::json!({ "kind": "updated", "revision": rev }),
        );
    }
    if !orphans.is_empty() {
        let _ = app.emit(
            "matrix:changed",
            serde_json::json!({ "kind": "updated", "revision": rev }),
        );
    }
    Ok(())
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

/// Places a task in a quadrant, moving it if it is already placed elsewhere.
#[tauri::command]
pub fn matrix_set_quadrant(
    state: State<AppState>,
    task_id: String,
    quadrant: EisenhowerQuadrant,
) -> Result<EisenhowerMatrixFile, String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    let task = tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| AppError::NotFound(task_id.clone()).to_string())?;
    task.quadrant = Some(quadrant);
    task.updated_at = now_iso();

    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let item_id = match matrix.items.iter_mut().find(|i| i.task_id == task_id) {
        Some(existing) => {
            existing.quadrant = quadrant;
            existing.entered_quadrant_at = now_iso();
            existing.id.clone()
        }
        None => {
            let item = EisenhowerQuadrantItem {
                id: new_uuid(),
                task_id: task_id.clone(),
                quadrant,
                order: 0,
                urgency: String::new(),
                importance: String::new(),
                delegate_to: None,
                elimination_reason: None,
                staged_for_calendar: false,
                entered_quadrant_at: now_iso(),
            };
            let id = item.id.clone();
            matrix.items.push(item);
            id
        }
    };

    matrix.quadrant_order.remove_everywhere(&item_id);
    matrix.quadrant_order.list_mut(quadrant).push(item_id);
    reindex_order(&mut matrix);

    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    state
        .storage
        .write_matrix(&matrix)
        .map_err(|e| e.to_string())?;

    let rev = state.bump_revision();
    let app = state.timer.app();
    let _ = app.emit(
        "matrix:changed",
        serde_json::json!({ "kind": "updated", "revision": rev }),
    );
    let _ = app.emit(
        "tasks:changed",
        serde_json::json!({ "kind": "updated", "taskIds": [task_id], "revision": rev }),
    );
    Ok(matrix)
}

#[tauri::command]
pub fn matrix_remove_item(
    state: State<AppState>,
    item_id: String,
) -> Result<EisenhowerMatrixFile, String> {
    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let task_id = matrix
        .items
        .iter()
        .find(|i| i.id == item_id)
        .map(|i| i.task_id.clone())
        .ok_or_else(|| AppError::NotFound(item_id.clone()).to_string())?;

    matrix.items.retain(|i| i.id != item_id);
    matrix.quadrant_order.remove_everywhere(&item_id);
    reindex_order(&mut matrix);

    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
        task.quadrant = None;
        task.updated_at = now_iso();
        state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    }
    state
        .storage
        .write_matrix(&matrix)
        .map_err(|e| e.to_string())?;

    let rev = state.bump_revision();
    let app = state.timer.app();
    let _ = app.emit(
        "matrix:changed",
        serde_json::json!({ "kind": "updated", "revision": rev }),
    );
    let _ = app.emit(
        "tasks:changed",
        serde_json::json!({ "kind": "updated", "taskIds": [task_id], "revision": rev }),
    );
    Ok(matrix)
}

fn reindex_order(matrix: &mut EisenhowerMatrixFile) {
    let positions: Vec<(String, i32)> = [
        &matrix.quadrant_order.do_first,
        &matrix.quadrant_order.schedule,
        &matrix.quadrant_order.delegate,
        &matrix.quadrant_order.eliminate,
    ]
    .iter()
    .flat_map(|list| {
        list.iter()
            .enumerate()
            .map(|(index, id)| (id.clone(), index as i32))
    })
    .collect();

    for (id, index) in positions {
        if let Some(item) = matrix.items.iter_mut().find(|i| i.id == id) {
            item.order = index;
        }
    }
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
pub fn metrics_recalculate(state: State<AppState>) -> Result<ConsistencyMetric, String> {
    crate::metrics::recalculate(&state.storage).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activity_daily_totals(
    state: State<AppState>,
    days: u32,
) -> Result<Vec<DailyFocus>, String> {
    let target = state
        .storage
        .read_metrics()
        .map(|m| m.daily_target_minutes)
        .unwrap_or(120);
    Ok(state.storage.daily_focus_totals(days, target))
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
