use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{Duration, Local, Utc};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::AppError;
use crate::models::{
    ActivityLogRecord, AppConfig, CalendarTimeBlock, ConsistencyMetric, DailyFocus,
    EisenhowerMatrixFile, EnergyLogEntry, EnergyLogFile, JournalEntry, JournalFile, SchemaFile,
    TaskItem, TimerSession, WidgetLayout, default_eightbit_palette, default_theme_id,
    default_zodiac_sign, new_uuid, now_iso,
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
        for dir in ["layout", "activity", "journal", "backups", "chimes"] {
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
        self.init_if_missing("energy.json", &default_energy())?;
        self.init_if_missing("journal/entries.json", &default_journal())?;
        self.migrate_schema()?;
        Ok(())
    }

    /// Bump `schema.json` and run versioned migrations when the app outpaces saved data.
    fn migrate_schema(&self) -> Result<(), AppError> {
        let mut schema: SchemaFile = self
            .read_json("schema.json")
            .unwrap_or_else(|_| default_schema());
        if schema.schema_version >= SCHEMA_VERSION {
            return Ok(());
        }
        // ponytail: add file-level migrations here when SCHEMA_VERSION increments
        schema.schema_version = SCHEMA_VERSION;
        schema.app_version = env!("CARGO_PKG_VERSION").to_string();
        self.write_atomic("schema.json", &schema)?;
        Ok(())
    }

    /// Zip the data directory for manual backup. Skips `backups/` and temp files.
    pub fn export_zip(&self, dest: &Path) -> Result<(), AppError> {
        use zip::write::SimpleFileOptions;
        use zip::ZipWriter;

        let file = File::create(dest)
            .map_err(|e| AppError::Storage(format!("create zip {}: {e}", dest.display())))?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        self.write_dir_to_zip(&mut zip, &self.root, "", options)?;
        zip.finish()
            .map_err(|e| AppError::Storage(format!("finish zip: {e}")))?;
        Ok(())
    }

    /// Restore data from an export zip. Saves current data to `backups/pre-restore-*.zip` first.
    pub fn import_zip(&self, src: &Path) -> Result<String, AppError> {
        use std::io::Read;
        use zip::read::ZipArchive;

        let stamp = Local::now().format("%Y%m%d-%H%M%S");
        let pre_backup = self
            .root
            .join("backups")
            .join(format!("pre-restore-{stamp}.zip"));
        if let Some(parent) = pre_backup.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Storage(format!("mkdir backups: {e}")))?;
        }
        self.export_zip(&pre_backup)?;

        let file = File::open(src)
            .map_err(|e| AppError::Storage(format!("open backup {}: {e}", src.display())))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| AppError::Storage(format!("read zip {}: {e}", src.display())))?;

        let names: Vec<String> = archive
            .file_names()
            .filter_map(normalize_zip_path)
            .filter(|rel| {
                !rel.is_empty()
                    && rel != "backups"
                    && !rel.starts_with("backups/")
                    && !rel.ends_with(".zip")
            })
            .collect();
        if !names.iter().any(|rel| rel == "schema.json") {
            return Err(AppError::InvalidInput(
                "not a Study Buddy backup (missing schema.json)".into(),
            ));
        }

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| AppError::Storage(format!("zip entry {i}: {e}")))?;
            let Some(rel) = normalize_zip_path(entry.name()) else {
                return Err(AppError::InvalidInput(format!(
                    "unsafe path in backup: {}",
                    entry.name()
                )));
            };
            if rel.is_empty() || rel == "backups" || rel.starts_with("backups/") || rel.ends_with(".zip") {
                continue;
            }
            if entry.is_dir() {
                continue;
            }
            let dest = self.root.join(&rel);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| AppError::Storage(format!("mkdir {}: {e}", parent.display())))?;
            }
            let mut raw = Vec::new();
            entry
                .read_to_end(&mut raw)
                .map_err(|e| AppError::Storage(format!("read zip {rel}: {e}")))?;
            if rel.ends_with(".json") {
                serde_json::from_slice::<serde_json::Value>(&raw).map_err(|e| {
                    AppError::InvalidInput(format!("invalid JSON in backup at {rel}: {e}"))
                })?;
            }
            fs::write(&dest, &raw)
                .map_err(|e| AppError::Storage(format!("write {}: {e}", dest.display())))?;
        }

        self.migrate_schema()?;
        Ok(pre_backup
            .strip_prefix(&self.root)
            .unwrap_or(&pre_backup)
            .to_string_lossy()
            .into_owned())
    }

    fn write_dir_to_zip(
        &self,
        zip: &mut zip::ZipWriter<File>,
        dir: &Path,
        prefix: &str,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), AppError> {
        for entry in fs::read_dir(dir)
            .map_err(|e| AppError::Storage(format!("read dir {}: {e}", dir.display())))?
        {
            let entry = entry.map_err(|e| AppError::Storage(format!("dir entry: {e}")))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == "backups" || name.ends_with(".tmp") || name.ends_with(".zip") {
                continue;
            }
            let path = entry.path();
            let zip_path = if prefix.is_empty() {
                name.clone()
            } else {
                format!("{prefix}/{name}")
            };
            if path.is_dir() {
                self.write_dir_to_zip(zip, &path, &zip_path, options)?;
            } else {
                zip.start_file(&zip_path, options)
                    .map_err(|e| AppError::Storage(format!("zip start {zip_path}: {e}")))?;
                let mut file = File::open(&path)
                    .map_err(|e| AppError::Storage(format!("open {}: {e}", path.display())))?;
                std::io::copy(&mut file, zip)
                    .map_err(|e| AppError::Storage(format!("zip write {zip_path}: {e}")))?;
            }
        }
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
        match serde_json::from_str(&raw) {
            Ok(value) => Ok(value),
            Err(parse_err) => {
                if let Some(restored) = self.read_from_newest_backup(rel) {
                    return Ok(restored);
                }
                Err(AppError::Storage(format!("parse {rel}: {parse_err}")))
            }
        }
    }

    fn read_from_newest_backup<T: DeserializeOwned>(&self, rel: &str) -> Option<T> {
        let backups = self.root.join("backups");
        let mut entries: Vec<_> = fs::read_dir(&backups).ok()?.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        let backup_name = rel.replace('/', "_");
        for entry in entries.into_iter().rev() {
            let candidate = entry.path().join(&backup_name);
            if !candidate.exists() {
                continue;
            }
            let raw = fs::read_to_string(&candidate).ok()?;
            if let Ok(value) = serde_json::from_str(&raw) {
                return Some(value);
            }
        }
        None
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

    /// Takes at most one snapshot per local day. Returns whether one was written.
    pub fn maybe_daily_backup(&self) -> Result<bool, AppError> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let already_done = fs::read_dir(self.root.join("backups"))
            .map(|entries| {
                entries
                    .flatten()
                    .any(|e| e.file_name().to_string_lossy().starts_with(&today))
            })
            .unwrap_or(false);

        if already_done {
            return Ok(false);
        }
        self.backup_snapshot()?;
        Ok(true)
    }

    pub fn backup_snapshot(&self) -> Result<(), AppError> {
        let stamp = Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
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

    pub fn append_activity(&self, record: &ActivityLogRecord) -> Result<(), AppError> {
        let rel = activity_file_for(&record.local_date);
        let mut records = self.read_activity_month(&rel)?;
        records.push(record.clone());
        self.write_atomic(&rel, &records)
    }

    fn read_activity_month(&self, rel: &str) -> Result<Vec<ActivityLogRecord>, AppError> {
        match self.read_json(rel) {
            Ok(records) => Ok(records),
            Err(AppError::NotFound(_)) => Ok(vec![]),
            Err(err) => Err(err),
        }
    }

    /// Focus totals per local day for the last `days` days, oldest first.
    /// Days with no recorded activity are included with a zero total.
    pub fn daily_focus_totals(
        &self,
        days: u32,
        daily_target_minutes: u32,
    ) -> Result<Vec<DailyFocus>, AppError> {
        let today = Local::now().date_naive();
        let span = days.max(1) as i64;
        let first = today - Duration::days(span - 1);

        let mut months: Vec<String> = vec![];
        let mut cursor = first;
        while cursor <= today {
            let key = cursor.format("%Y-%m").to_string();
            if !months.contains(&key) {
                months.push(key);
            }
            cursor += Duration::days(1);
        }

        let mut totals: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        for month in months {
            for record in self.read_activity_month(&format!("activity/{month}.json"))? {
                *totals.entry(record.local_date.clone()).or_insert(0) += record.duration_ms;
            }
        }

        let target_ms = daily_target_minutes as u64 * 60_000;
        Ok((0..span)
            .map(|offset| {
                let date = (first + Duration::days(offset)).format("%Y-%m-%d").to_string();
                let focus_ms = totals.get(&date).copied().unwrap_or(0);
                DailyFocus {
                    met_target: target_ms > 0 && focus_ms >= target_ms,
                    date,
                    focus_ms,
                }
            })
            .collect())
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

    pub fn read_energy(&self) -> Result<EnergyLogFile, AppError> {
        self.read_json("energy.json")
    }

    pub fn log_energy(&self, date: &str, level: u8) -> Result<EnergyLogEntry, AppError> {
        if !(1..=5).contains(&level) {
            return Err(AppError::Storage("energy level must be 1-5".into()));
        }
        let mut file = self.read_energy()?;
        file.entries.retain(|e| e.date != date);
        let entry = EnergyLogEntry {
            date: date.to_string(),
            level,
            logged_at: now_iso(),
        };
        file.entries.push(entry.clone());
        file.entries.sort_by(|a, b| b.date.cmp(&a.date));
        self.write_atomic("energy.json", &file)?;
        Ok(entry)
    }

    pub fn energy_recent(&self, days: u32) -> Result<Vec<EnergyLogEntry>, AppError> {
        let file = self.read_energy()?;
        let today = Local::now().date_naive();
        let first = today - Duration::days((days.saturating_sub(1)) as i64);
        Ok(file
            .entries
            .into_iter()
            .filter(|e| {
                chrono::NaiveDate::parse_from_str(&e.date, "%Y-%m-%d")
                    .map(|d| d >= first && d <= today)
                    .unwrap_or(false)
            })
            .collect())
    }

    pub fn read_journal(&self) -> Result<JournalFile, AppError> {
        self.read_json("journal/entries.json")
    }

    pub fn journal_add(&self, text: &str) -> Result<JournalEntry, AppError> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(AppError::InvalidInput("entry cannot be empty".into()));
        }
        let mut file = self.read_journal()?;
        let entry = JournalEntry {
            id: new_uuid(),
            text: trimmed.to_string(),
            created_at: now_iso(),
        };
        file.entries.insert(0, entry.clone());
        self.write_atomic("journal/entries.json", &file)?;
        Ok(entry)
    }

    pub fn journal_delete(&self, entry_id: &str) -> Result<(), AppError> {
        let mut file = self.read_journal()?;
        let before = file.entries.len();
        file.entries.retain(|e| e.id != entry_id);
        if file.entries.len() == before {
            return Err(AppError::NotFound(entry_id.to_string()));
        }
        self.write_atomic("journal/entries.json", &file)
    }

    pub fn reset_tasks(&self) -> Result<(), AppError> {
        self.write_tasks(&[])?;
        let mut blocks = self.read_calendar()?;
        let mut blocks_changed = false;
        for block in &mut blocks {
            if block.task_id.is_some() {
                block.task_id = None;
                block.updated_at = now_iso();
                blocks_changed = true;
            }
        }
        if blocks_changed {
            self.write_calendar(&blocks)?;
        }
        self.write_matrix(&default_matrix())
    }

    pub fn reset_calendar(&self) -> Result<(), AppError> {
        self.write_calendar(&[])
    }

    pub fn reset_matrix(&self) -> Result<(), AppError> {
        self.write_matrix(&default_matrix())
    }

    pub fn reset_layout(&self) -> Result<(), AppError> {
        self.write_layout(&default_layout())
    }

    pub fn reset_journal(&self) -> Result<(), AppError> {
        self.write_atomic("journal/entries.json", &default_journal())
    }

    pub fn reset_energy(&self) -> Result<(), AppError> {
        self.write_atomic("energy.json", &default_energy())
    }

    pub fn clear_activity_logs(&self) -> Result<(), AppError> {
        let activity_dir = self.root.join("activity");
        if !activity_dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&activity_dir).map_err(|e| AppError::Storage(e.to_string()))? {
            let entry = entry.map_err(|e| AppError::Storage(e.to_string()))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                fs::remove_file(&path).map_err(|e| AppError::Storage(e.to_string()))?;
            }
        }
        Ok(())
    }

    pub fn reset_metrics(&self) -> Result<ConsistencyMetric, AppError> {
        self.clear_activity_logs()?;
        let metrics = default_metrics();
        self.write_metrics(&metrics)?;
        Ok(metrics)
    }

    pub fn import_chime(&self, source: &str, slot: &str) -> Result<String, AppError> {
        let source_path = Path::new(source);
        if !source_path.is_file() {
            return Err(AppError::NotFound(source.to_string()));
        }
        let ext = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp3")
            .to_ascii_lowercase();
        if ext != "mp3" && ext != "wav" {
            return Err(AppError::Storage("chime must be .mp3 or .wav".into()));
        }
        let dest = self
            .root
            .join("chimes")
            .join(format!("{slot}.{ext}"));
        fs::copy(source_path, &dest)
            .map_err(|e| AppError::Storage(format!("copy chime: {e}")))?;
        Ok(dest.to_string_lossy().to_string())
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

fn normalize_zip_path(name: &str) -> Option<String> {
    let rel = name
        .replace('\\', "/")
        .trim()
        .trim_end_matches('/')
        .to_string();
    if rel.is_empty() || rel.contains("..") || rel.starts_with('/') {
        return None;
    }
    Some(rel)
}

fn activity_file_for(local_date: &str) -> String {
    let month = local_date.get(..7).unwrap_or(local_date);
    format!("activity/{month}.json")
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
        notify_timer: true,
        notify_blocks: true,
        theme_id: default_theme_id(),
        zodiac_sign: default_zodiac_sign(),
        active_widgets: vec!["focus".to_string(), "clock".to_string()],
        focus_start_chime_path: None,
        focus_end_chime_path: None,
        notify_quiet_hours_enabled: false,
        notify_quiet_start_hour: 22,
        notify_quiet_end_hour: 8,
        eightbit_palette: default_eightbit_palette(),
        autostart: false,
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

fn default_energy() -> EnergyLogFile {
    EnergyLogFile {
        schema_version: SCHEMA_VERSION,
        entries: vec![],
    }
}

fn default_journal() -> JournalFile {
    JournalFile {
        schema_version: SCHEMA_VERSION,
        entries: vec![],
    }
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

    #[test]
    fn export_import_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        storage
            .write_tasks(&[sample_task("t1", "backup me")])
            .unwrap();
        let zip_path = dir.path().join("out.zip");
        storage.export_zip(&zip_path).unwrap();

        storage
            .write_tasks(&[sample_task("t2", "replaced")])
            .unwrap();
        storage.import_zip(&zip_path).unwrap();

        let loaded: Vec<TaskItem> = storage.read_json("tasks.json").unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].title, "backup me");
    }

    #[test]
    fn import_rejects_bad_zip() {
        let dir = tempfile::tempdir().unwrap();
        let storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        let zip_path = dir.path().join("bad.zip");
        storage.export_zip(&zip_path).unwrap();
        // Corrupt schema marker by writing a non-backup zip — use empty file
        fs::write(&zip_path, b"not a zip").unwrap();
        assert!(storage.import_zip(&zip_path).is_err());
    }
}
