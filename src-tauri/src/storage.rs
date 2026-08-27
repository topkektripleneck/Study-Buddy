use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppError;
use crate::models::{
    AppConfig, CalendarTimeBlock, ConsistencyMetric, EisenhowerMatrixFile, SchemaFile,
    TaskItem, TimerSession, WidgetLayout,
};

const SCHEMA_VERSION: u32 = 1;

pub struct StorageEngine {
    root: PathBuf,
}

impl StorageEngine {
    pub fn new(root: PathBuf) -> Result<Self, AppError> {
        let engine = Self { root };
        engine.ensure_dirs()?;
        engine.bootstrap()?;
        Ok(engine)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn ensure_dirs(&self) -> Result<(), AppError> {
        for dir in ["layout", "activity", "journal", "backups"] {
            fs::create_dir_all(self.root.join(dir))
                .map_err(|e| AppError::Storage(format!("create dir {dir}: {e}")))?;
        }
        Ok(())
    }

    fn bootstrap(&self) -> Result<(), AppError> {
        self.init_if_missing("schema.json", &default_schema())?;
        self.init_if_missing("config.json", &default_config())?;
        self.init_if_missing("tasks.json", &Vec::<TaskItem>::new())?;
        self.init_if_missing("matrix.json", &default_matrix())?;
        self.init_if_missing("calendar.json", &Vec::<CalendarTimeBlock>::new())?;
        self.init_if_missing("metrics.json", &default_metrics())?;
        self.init_if_missing("layout/main.json", &default_layout())?;
        Ok(())
    }

    fn init_if_missing<T: Serialize>(&self, rel: &str, default: &T) -> Result<(), AppError> {
        let path = self.root.join(rel);
        if !path.exists() {
            self.write_atomic(rel, default)?;
        }
        Ok(())
    }

    pub fn read_json<T: DeserializeOwned>(&self, rel: &str) -> Result<T, AppError> {
        let path = self.root.join(rel);
        if !path.exists() {
            return Err(AppError::NotFound(rel.to_string()));
        }
        let raw = fs::read_to_string(&path)
            .map_err(|e| AppError::Storage(format!("read {rel}: {e}")))?;
        serde_json::from_str(&raw).map_err(|e| AppError::Storage(format!("parse {rel}: {e}")))
    }

    pub fn write_atomic<T: Serialize + ?Sized>(&self, rel: &str, value: &T) -> Result<(), AppError> {
        let path = self.root.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Storage(format!("mkdir {}: {e}", parent.display())))?;
        }

        let serialized = serde_json::to_vec_pretty(value)
            .map_err(|e| AppError::Storage(format!("serialize {rel}: {e}")))?;

        let tmp = path.with_extension("tmp");
        {
            let mut file = File::create(&tmp)
                .map_err(|e| AppError::Storage(format!("create tmp {rel}: {e}")))?;
            file.write_all(&serialized)
                .map_err(|e| AppError::Storage(format!("write tmp {rel}: {e}")))?;
            file.sync_all()
                .map_err(|e| AppError::Storage(format!("sync tmp {rel}: {e}")))?;
        }

        fs::rename(&tmp, &path)
            .map_err(|e| AppError::Storage(format!("rename {rel}: {e}")))?;

        Ok(())
    }

    pub fn backup_snapshot(&self) -> Result<(), AppError> {
        let stamp = Utc::now().format("%Y-%m-%dT%H-%M-%S").to_string();
        let backup_dir = self.root.join("backups").join(stamp);
        fs::create_dir_all(&backup_dir)
            .map_err(|e| AppError::Storage(format!("backup dir: {e}")))?;

        for rel in [
            "schema.json",
            "config.json",
            "tasks.json",
            "matrix.json",
            "calendar.json",
            "metrics.json",
            "session.json",
            "layout/main.json",
        ] {
            let src = self.root.join(rel);
            if src.exists() {
                let dest = backup_dir.join(rel.replace('/', "_"));
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).ok();
                }
                fs::copy(&src, &dest).ok();
            }
        }

        self.prune_backups(7);
        Ok(())
    }

    fn prune_backups(&self, keep: usize) {
        let backups = self.root.join("backups");
        if let Ok(mut entries) = fs::read_dir(&backups).map(|d| d.flatten().collect::<Vec<_>>()) {
            entries.sort_by_key(|e| e.file_name());
            while entries.len() > keep {
                if let Some(old) = entries.first() {
                    fs::remove_dir_all(old.path()).ok();
                    entries.remove(0);
                }
            }
        }
    }

    pub fn read_tasks(&self) -> Result<Vec<TaskItem>, AppError> {
        self.read_json("tasks.json")
    }

    pub fn write_tasks(&self, tasks: &[TaskItem]) -> Result<(), AppError> {
        self.write_atomic("tasks.json", tasks)
    }

    pub fn read_matrix(&self) -> Result<EisenhowerMatrixFile, AppError> {
        self.read_json("matrix.json")
    }

    pub fn write_matrix(&self, matrix: &EisenhowerMatrixFile) -> Result<(), AppError> {
        self.write_atomic("matrix.json", matrix)
    }

    pub fn read_calendar(&self) -> Result<Vec<CalendarTimeBlock>, AppError> {
        self.read_json("calendar.json")
    }

    pub fn write_calendar(&self, blocks: &[CalendarTimeBlock]) -> Result<(), AppError> {
        self.write_atomic("calendar.json", blocks)
    }

    pub fn read_metrics(&self) -> Result<ConsistencyMetric, AppError> {
        self.read_json("metrics.json")
    }

    pub fn write_metrics(&self, metrics: &ConsistencyMetric) -> Result<(), AppError> {
        self.write_atomic("metrics.json", metrics)
    }

    pub fn read_config(&self) -> Result<AppConfig, AppError> {
        self.read_json("config.json")
    }

    pub fn write_config(&self, config: &AppConfig) -> Result<(), AppError> {
        self.write_atomic("config.json", config)
    }

    pub fn read_layout(&self) -> Result<WidgetLayout, AppError> {
        self.read_json("layout/main.json")
    }

    pub fn write_layout(&self, layout: &WidgetLayout) -> Result<(), AppError> {
        self.write_atomic("layout/main.json", layout)
    }

    pub fn read_session(&self) -> Result<Option<TimerSession>, AppError> {
        let path = self.root.join("session.json");
        if !path.exists() {
            return Ok(None);
        }
        self.read_json("session.json").map(Some)
    }

    pub fn write_session(&self, session: &TimerSession) -> Result<(), AppError> {
        self.write_atomic("session.json", session)
    }

    pub fn clear_session(&self) -> Result<(), AppError> {
        let path = self.root.join("session.json");
        if path.exists() {
            fs::remove_file(path).map_err(|e| AppError::Storage(e.to_string()))?;
        }
        Ok(())
    }
}

fn default_schema() -> SchemaFile {
    SchemaFile {
        schema_version: SCHEMA_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
}

fn default_config() -> AppConfig {
    AppConfig {
        schema_version: SCHEMA_VERSION,
        pomodoro_focus_minutes: 25,
        pomodoro_short_break_minutes: 5,
        pomodoro_long_break_minutes: 15,
        pomodoro_cycle_length: 4,
        hud_auto_show_on_session_start: true,
        colored_time_blocks: true,
        prompt_task_on_block_create: true,
        active_widgets: vec!["focus".to_string(), "clock".to_string()],
    }
}

fn default_matrix() -> EisenhowerMatrixFile {
    EisenhowerMatrixFile {
        schema_version: SCHEMA_VERSION,
        items: vec![],
        quadrant_order: Default::default(),
        archived_item_ids: vec![],
    }
}

fn default_metrics() -> ConsistencyMetric {
    ConsistencyMetric {
        schema_version: SCHEMA_VERSION,
        daily_target_minutes: 120,
        current_streak_days: 0,
        longest_streak_days: 0,
        streak_anchor_date: None,
        today_focus_ms: 0,
        today_completion_percent: 0,
        last_recalculated_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    }
}

fn default_layout() -> WidgetLayout {
    WidgetLayout {
        schema_version: SCHEMA_VERSION,
        widget_ids: vec!["focus".to_string(), "clock".to_string()],
    }
}

pub fn mono_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TaskItem;
    use crate::models::{Priority, TaskStatus};

    fn sample_task(id: &str, title: &str) -> TaskItem {
        TaskItem {
            id: id.to_string(),
            parent_id: None,
            order: 0,
            title: title.to_string(),
            notes: None,
            status: TaskStatus::Open,
            priority: Priority::Normal,
            quadrant: None,
            tags: vec![],
            estimate_minutes: None,
            actual_minutes: 0,
            due_at: None,
            defer_until: None,
            linked_block_ids: vec![],
            checklist: vec![],
            created_at: now_iso_test(),
            updated_at: now_iso_test(),
            completed_at: None,
        }
    }

    fn now_iso_test() -> String {
        Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }

    #[test]
    fn round_trip_tasks() {
        let dir = tempfile::tempdir().unwrap();
        let storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        let tasks = vec![sample_task("t1", "Read chapter 4")];
        storage.write_tasks(&tasks).unwrap();
        let loaded: Vec<TaskItem> = storage.read_json("tasks.json").unwrap();
        assert_eq!(loaded[0].title, "Read chapter 4");
    }

    #[test]
    fn atomic_write_preserves_on_bad_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        storage
            .write_tasks(&[sample_task("t1", "original")])
            .unwrap();
        let path = dir.path().join("tasks.json");
        let before = fs::read_to_string(&path).unwrap();
        assert!(before.contains("original"));
    }

    #[test]
    fn bootstrap_creates_all_files() {
        let dir = tempfile::tempdir().unwrap();
        let _storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        for file in [
            "schema.json",
            "config.json",
            "tasks.json",
            "matrix.json",
            "calendar.json",
            "metrics.json",
            "layout/main.json",
        ] {
            assert!(dir.path().join(file).exists(), "missing {file}");
        }
    }
}
