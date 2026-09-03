use tauri::Emitter;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::{
    AppConfig, CalendarImportResult, CalendarTimeBlock, ConsistencyMetric, DailyFocus,
    EisenhowerMatrixFile, EisenhowerQuadrant, EisenhowerQuadrantItem, EnergyLogEntry,
    JournalEntry, TaskItem, TaskStatus, TimerTickPayload, WidgetLayout, new_uuid, now_iso,
};
use crate::state::AppState;
use crate::windows::WindowManager;

#[tauri::command]
pub fn notify_take_pending() -> Vec<serde_json::Value> {
    crate::notify::take_pending_toasts()
}

#[tauri::command]
pub fn notify_test(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let config = state.storage.read_config().map_err(|e| e.to_string())?;
    crate::notify::send_test_notification(&app, &config);
    Ok(())
}

#[tauri::command]
pub async fn window_open(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let app2 = app.clone();
    let label2 = label.clone();
    tauri::async_runtime::spawn(async move { WindowManager::open(&app2, &label2) })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    emit_window_visibility(&app, &label, true);
    Ok(())
}

#[tauri::command]
pub async fn window_close(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let app2 = app.clone();
    let label2 = label.clone();
    tauri::async_runtime::spawn(async move { WindowManager::close(&app2, &label2) })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    emit_window_visibility(&app, &label, false);
    Ok(())
}

#[tauri::command]
pub fn window_is_open(app: tauri::AppHandle, label: String) -> Result<bool, String> {
    Ok(WindowManager::is_open(&app, &label))
}

#[tauri::command]
pub async fn window_toggle(app: tauri::AppHandle, label: String) -> Result<bool, String> {
    let app2 = app.clone();
    let label2 = label.clone();
    let open = tauri::async_runtime::spawn(async move { toggle_window_from_tray(&app2, &label2) })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    Ok(open)
}

pub fn toggle_window_from_tray(app: &tauri::AppHandle, label: &str) -> Result<bool, AppError> {
    let open = WindowManager::toggle(app, label)?;
    emit_window_visibility(app, label, open);
    Ok(open)
}

pub(crate) fn emit_window_visibility(app: &tauri::AppHandle, label: &str, open: bool) {
    let _ = app.emit(
        "window:visibility",
        serde_json::json!({ "label": label, "open": open }),
    );
}

/// After window-state restore, sync checkbox/toggle UI in the main webview.
pub fn sync_auxiliary_window_visibility(app: &tauri::AppHandle) {
    for label in ["calendar", "hud"] {
        emit_window_visibility(app, label, WindowManager::is_open(app, label));
    }
}

#[tauri::command]
pub fn storage_open_data_dir(app: tauri::AppHandle, state: State<AppState>) -> Result<(), String> {
    let path = state.storage.root().to_string_lossy().to_string();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn storage_export_zip(state: State<AppState>, dest_path: String) -> Result<String, String> {
    let dest = std::path::PathBuf::from(&dest_path);
    state
        .storage
        .export_zip(&dest)
        .map_err(|e| e.to_string())?;
    Ok(dest_path)
}

#[tauri::command]
pub fn storage_import_zip(state: State<AppState>, src_path: String) -> Result<String, String> {
    let pre = state
        .storage
        .import_zip(std::path::Path::new(&src_path))
        .map_err(|e| e.to_string())?;
    emit_restore_events(&state).map_err(|e| e.to_string())?;
    Ok(format!(
        "Restored backup. Previous data saved to {pre}"
    ))
}

fn emit_restore_events(state: &AppState) -> Result<(), AppError> {
    let app = state.timer.app();
    let rev = state.bump_revision();
    let payload = serde_json::json!({ "kind": "restored", "revision": rev });
    for target in [
        "tasks",
        "calendar",
        "matrix",
        "layout",
        "journal",
        "energy",
    ] {
        let event = format!("{target}:changed");
        let _ = app.emit(event.as_str(), payload.clone());
    }
    let config = state.storage.read_config()?;
    let _ = app.emit("config:changed", &config);
    let metrics = state.storage.read_metrics()?;
    let _ = app.emit("metrics:changed", &metrics);
    state.timer.reload_from_storage()?;
    Ok(())
}

#[tauri::command]
pub fn matrix_update_item(
    state: State<AppState>,
    item_id: String,
    delegate_to: Option<String>,
    elimination_reason: Option<String>,
) -> Result<EisenhowerMatrixFile, String> {
    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let item = matrix
        .items
        .iter_mut()
        .find(|i| i.id == item_id)
        .ok_or_else(|| AppError::NotFound(item_id.clone()).to_string())?;
    if let Some(value) = delegate_to {
        item.delegate_to = if value.is_empty() { None } else { Some(value) };
    }
    if let Some(value) = elimination_reason {
        item.elimination_reason = if value.is_empty() { None } else { Some(value) };
    }
    state
        .storage
        .write_matrix(&matrix)
        .map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "matrix:changed",
        serde_json::json!({ "kind": "updated", "revision": rev }),
    );
    Ok(matrix)
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

/// Drag-and-drop placement: move an item to a quadrant at a specific index.
#[tauri::command]
pub fn matrix_move_item(
    state: State<AppState>,
    item_id: String,
    to_quadrant: EisenhowerQuadrant,
    to_index: usize,
) -> Result<EisenhowerMatrixFile, String> {
    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let item = matrix
        .items
        .iter_mut()
        .find(|i| i.id == item_id)
        .ok_or_else(|| AppError::NotFound(item_id.clone()).to_string())?;
    let task_id = item.task_id.clone();
    item.quadrant = to_quadrant;
    item.entered_quadrant_at = now_iso();

    matrix.quadrant_order.remove_everywhere(&item_id);
    let list = matrix.quadrant_order.list_mut(to_quadrant);
    let idx = to_index.min(list.len());
    list.insert(idx, item_id.clone());

    reindex_order(&mut matrix);

    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
        task.quadrant = Some(to_quadrant);
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
        serde_json::json!({ "kind": "moved", "itemIds": [item_id], "revision": rev }),
    );
    let _ = app.emit(
        "tasks:changed",
        serde_json::json!({ "kind": "updated", "taskIds": [task_id], "revision": rev }),
    );
    Ok(matrix)
}

#[tauri::command]
pub fn matrix_stage_for_calendar(
    state: State<AppState>,
    item_id: String,
) -> Result<(), String> {
    let mut matrix = state.storage.read_matrix().map_err(|e| e.to_string())?;
    let item = matrix
        .items
        .iter_mut()
        .find(|i| i.id == item_id)
        .ok_or_else(|| AppError::NotFound(item_id.clone()).to_string())?;
    item.staged_for_calendar = true;
    let task_id = item.task_id.clone();
    let title = state
        .storage
        .read_tasks()
        .ok()
        .and_then(|tasks| tasks.iter().find(|t| t.id == task_id).map(|t| t.title.clone()))
        .unwrap_or_else(|| "Task".into());
    state
        .storage
        .write_matrix(&matrix)
        .map_err(|e| e.to_string())?;

    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "matrix:staged-for-calendar",
        serde_json::json!({
            "quadrantItemId": item_id,
            "taskId": task_id,
            "title": title,
            "suggestedDurationMinutes": 60,
            "revision": rev,
        }),
    );
    Ok(())
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
    mut block: CalendarTimeBlock,
) -> Result<CalendarTimeBlock, String> {
    let mut blocks = state.storage.read_calendar().map_err(|e| e.to_string())?;
    let is_new = !blocks.iter().any(|b| b.id == block.id);

    if is_new {
        if block.recurrence.is_some() {
            block.series_id = Some(block.series_id.clone().unwrap_or_else(new_uuid));
        }
        crate::calendar::append_block(&mut blocks, block.clone());
    } else if let Some(idx) = blocks.iter().position(|b| b.id == block.id) {
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
pub fn calendar_import_ics(state: State<AppState>, src_path: String) -> Result<CalendarImportResult, String> {
    use std::fs;

    let raw = fs::read_to_string(&src_path).map_err(|e| e.to_string())?;
    let events = crate::ics::parse(&raw).map_err(|e| e.to_string())?;
    let mut blocks = state.storage.read_calendar().map_err(|e| e.to_string())?;
    let mut imported = 0u32;
    let mut skipped = 0u32;

    for event in events {
        let block = crate::ics::to_block(&event);
        if blocks
            .iter()
            .any(|b| b.title == block.title && b.start_at == block.start_at)
        {
            skipped += 1;
            continue;
        }
        crate::calendar::append_block(&mut blocks, block);
        imported += 1;
    }

    state
        .storage
        .write_calendar(&blocks)
        .map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "calendar:changed",
        serde_json::json!({ "kind": "imported", "revision": rev }),
    );

    let message = if imported == 0 {
        "No new events imported (all duplicates or empty file)".into()
    } else {
        format!("Imported {imported} event(s) from Google Calendar export")
    };
    Ok(CalendarImportResult {
        imported,
        skipped,
        message,
    })
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
    let mut changed_ids: Vec<String> = vec![];
    for task in &mut tasks {
        let before = task.linked_block_ids.len();
        task.linked_block_ids.retain(|id| id != &block_id);
        if task.linked_block_ids.len() != before {
            task.updated_at = now_iso();
            changed_ids.push(task.id.clone());
        }
    }
    if !changed_ids.is_empty() {
        state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    }

    let rev = state.bump_revision();
    let app = state.timer.app();
    let _ = app.emit(
        "calendar:changed",
        serde_json::json!({ "kind": "deleted", "blockIds": [block_id], "revision": rev }),
    );
    if !changed_ids.is_empty() {
        let _ = app.emit(
            "tasks:changed",
            serde_json::json!({ "kind": "updated", "taskIds": changed_ids, "revision": rev }),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn metrics_get(state: State<AppState>) -> Result<ConsistencyMetric, String> {
    state.storage.read_metrics().map_err(|e| e.to_string())
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
    Ok(state.storage.daily_focus_totals(days, target)?)
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
    state
        .storage
        .write_layout(&layout)
        .map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "layout:changed",
        serde_json::json!({ "revision": rev }),
    );
    Ok(())
}

#[derive(Clone, Copy)]
enum ResetTarget {
    All,
    Tasks,
    Calendar,
    Matrix,
    Layout,
    Journal,
    Energy,
    Timer,
    Metrics,
}

fn parse_reset_target(raw: &str) -> Option<ResetTarget> {
    match raw.trim().to_lowercase().as_str() {
        "all" => Some(ResetTarget::All),
        "tasks" | "task" => Some(ResetTarget::Tasks),
        "calendar" | "schedule" | "blocks" => Some(ResetTarget::Calendar),
        "matrix" => Some(ResetTarget::Matrix),
        "widgets" | "widget" | "layout" => Some(ResetTarget::Layout),
        "journal" => Some(ResetTarget::Journal),
        "energy" => Some(ResetTarget::Energy),
        "timer" | "focus" | "session" => Some(ResetTarget::Timer),
        "metrics" | "stats" | "streak" | "activity" => Some(ResetTarget::Metrics),
        _ => None,
    }
}

fn emit_reset_events(app: &tauri::AppHandle, rev: u64, targets: &[&str]) {
    let payload = serde_json::json!({ "kind": "reset", "revision": rev });
    for target in targets {
        let event = format!("{target}:changed");
        let _ = app.emit(event.as_str(), payload.clone());
    }
}

#[tauri::command]
pub fn data_reset(state: State<AppState>, target: String) -> Result<String, String> {
    let target = parse_reset_target(&target)
        .ok_or_else(|| format!("Unknown reset target \"{target}\" — try all, timer, tasks, calendar, matrix, widgets, journal, energy, or metrics"))?;

    let app = state.timer.app();
    let storage = &state.storage;
    let message = match target {
        ResetTarget::Timer => {
            state.timer.reset().map_err(|e| e.to_string())?;
            "Timer cleared".into()
        }
        ResetTarget::Tasks => {
            storage.reset_tasks().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["tasks", "calendar", "matrix"]);
            "Tasks, matrix placements, and block links cleared".into()
        }
        ResetTarget::Calendar => {
            storage.reset_calendar().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["calendar"]);
            "Calendar cleared".into()
        }
        ResetTarget::Matrix => {
            storage.reset_matrix().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["matrix"]);
            "Matrix cleared".into()
        }
        ResetTarget::Layout => {
            storage.reset_layout().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["layout"]);
            "Widgets reset to default".into()
        }
        ResetTarget::Journal => {
            storage.reset_journal().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["journal"]);
            "Journal cleared".into()
        }
        ResetTarget::Energy => {
            storage.reset_energy().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(app, rev, &["energy"]);
            "Energy log cleared".into()
        }
        ResetTarget::Metrics => {
            let metrics = storage.reset_metrics().map_err(|e| e.to_string())?;
            let _rev = state.bump_revision();
            let _ = app.emit("metrics:changed", &metrics);
            "Focus history and streak stats cleared".into()
        }
        ResetTarget::All => {
            storage.reset_tasks().map_err(|e| e.to_string())?;
            storage.reset_calendar().map_err(|e| e.to_string())?;
            storage.reset_layout().map_err(|e| e.to_string())?;
            storage.reset_journal().map_err(|e| e.to_string())?;
            storage.reset_energy().map_err(|e| e.to_string())?;
            let metrics = storage.reset_metrics().map_err(|e| e.to_string())?;
            state.timer.reset().map_err(|e| e.to_string())?;
            let rev = state.bump_revision();
            emit_reset_events(
                app,
                rev,
                &[
                    "tasks",
                    "calendar",
                    "matrix",
                    "layout",
                    "journal",
                    "energy",
                ],
            );
            let _ = app.emit("metrics:changed", &metrics);
            "All tasks, calendar, widgets, journal, energy, metrics, and timer cleared".into()
        }
    };

    Ok(message)
}

#[tauri::command]
pub fn energy_recent(state: State<AppState>, days: u32) -> Result<Vec<EnergyLogEntry>, String> {
    state.storage.energy_recent(days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn energy_log(state: State<AppState>, level: u8) -> Result<EnergyLogEntry, String> {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let entry = state
        .storage
        .log_energy(&date, level)
        .map_err(|e| e.to_string())?;
    let _ = state.timer.app().emit("energy:changed", &entry);
    Ok(entry)
}

#[tauri::command]
pub fn metrics_set_target(
    state: State<AppState>,
    daily_target_minutes: u32,
) -> Result<ConsistencyMetric, String> {
    let mut metrics = state.storage.read_metrics().map_err(|e| e.to_string())?;
    metrics.daily_target_minutes = daily_target_minutes.max(1);
    metrics.last_recalculated_at = now_iso();
    if let Ok(fresh) = crate::metrics::recalculate(&state.storage) {
        metrics = fresh;
    }
    state
        .storage
        .write_metrics(&metrics)
        .map_err(|e| e.to_string())?;
    let _ = state.timer.app().emit("metrics:changed", &metrics);
    Ok(metrics)
}

#[tauri::command]
pub fn journal_list(state: State<AppState>) -> Result<Vec<JournalEntry>, String> {
    state
        .storage
        .read_journal()
        .map(|file| file.entries)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn journal_save(state: State<AppState>, text: String) -> Result<JournalEntry, String> {
    let entry = state
        .storage
        .journal_add(&text)
        .map_err(|e| e.to_string())?;
    let _ = state.timer.app().emit("journal:changed", &entry);
    Ok(entry)
}

#[tauri::command]
pub fn journal_delete(state: State<AppState>, entry_id: String) -> Result<(), String> {
    state
        .storage
        .journal_delete(&entry_id)
        .map_err(|e| e.to_string())?;
    let _ = state.timer.app().emit("journal:changed", ());
    Ok(())
}

#[tauri::command]
pub fn chime_import(
    state: State<AppState>,
    source_path: String,
    slot: String,
) -> Result<AppConfig, String> {
    if slot != "start" && slot != "end" {
        return Err("slot must be start or end".into());
    }
    let dest = state
        .storage
        .import_chime(&source_path, &slot)
        .map_err(|e| e.to_string())?;
    let mut config = state.storage.read_config().map_err(|e| e.to_string())?;
    if slot == "start" {
        config.focus_start_chime_path = Some(dest);
    } else {
        config.focus_end_chime_path = Some(dest);
    }
    state
        .storage
        .write_config(&config)
        .map_err(|e| e.to_string())?;
    let _ = state.timer.app().emit("config:changed", &config);
    Ok(config)
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

#[tauri::command]
pub fn timer_get_pending_restore(
    state: State<AppState>,
) -> Result<Option<crate::models::TimerRestoreOffer>, String> {
    Ok(state.timer.get_pending_restore())
}

#[tauri::command]
pub fn timer_confirm_restore(state: State<AppState>) -> Result<TimerTickPayload, String> {
    state.timer.confirm_restore().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_discard_restore(state: State<AppState>) -> Result<(), String> {
    state.timer.discard_restore().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn timer_ack_suspend(state: State<AppState>) -> Result<TimerTickPayload, String> {
    state.timer.ack_suspend().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_reorder(state: State<AppState>, ordered_ids: Vec<String>) -> Result<Vec<TaskItem>, String> {
    let mut tasks = state.storage.read_tasks().map_err(|e| e.to_string())?;
    for (i, id) in ordered_ids.iter().enumerate() {
        if let Some(task) = tasks.iter_mut().find(|t| t.id == *id) {
            task.order = i as i32;
            task.updated_at = now_iso();
        }
    }
    tasks.sort_by_key(|t| t.order);
    state.storage.write_tasks(&tasks).map_err(|e| e.to_string())?;
    let rev = state.bump_revision();
    let _ = state.timer.app().emit(
        "tasks:changed",
        serde_json::json!({ "kind": "reordered", "revision": rev }),
    );
    Ok(tasks)
}

#[tauri::command]
pub fn autostart_enable(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_disable(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().disable().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_is_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
