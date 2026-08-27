use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub type Uuid = String;
pub type Iso8601 = String;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EisenhowerQuadrant {
    DoFirst,
    Schedule,
    Delegate,
    Eliminate,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Open,
    InProgress,
    Blocked,
    Done,
    Archived,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Critical,
    High,
    Normal,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: Uuid,
    pub label: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskItem {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub order: i32,
    pub title: String,
    pub notes: Option<String>,
    pub status: TaskStatus,
    pub priority: Priority,
    pub quadrant: Option<EisenhowerQuadrant>,
    pub tags: Vec<String>,
    pub estimate_minutes: Option<u32>,
    pub actual_minutes: u32,
    pub due_at: Option<Iso8601>,
    pub defer_until: Option<Iso8601>,
    pub linked_block_ids: Vec<Uuid>,
    pub checklist: Vec<ChecklistItem>,
    pub created_at: Iso8601,
    pub updated_at: Iso8601,
    pub completed_at: Option<Iso8601>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EisenhowerQuadrantItem {
    pub id: Uuid,
    pub task_id: Uuid,
    pub quadrant: EisenhowerQuadrant,
    pub order: i32,
    pub urgency: String,
    pub importance: String,
    pub delegate_to: Option<String>,
    pub elimination_reason: Option<String>,
    pub staged_for_calendar: bool,
    pub entered_quadrant_at: Iso8601,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EisenhowerMatrixFile {
    pub schema_version: u32,
    pub items: Vec<EisenhowerQuadrantItem>,
    pub quadrant_order: QuadrantOrder,
    pub archived_item_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadrantOrder {
    pub do_first: Vec<Uuid>,
    pub schedule: Vec<Uuid>,
    pub delegate: Vec<Uuid>,
    pub eliminate: Vec<Uuid>,
}

impl Default for QuadrantOrder {
    fn default() -> Self {
        Self {
            do_first: vec![],
            schedule: vec![],
            delegate: vec![],
            eliminate: vec![],
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Focus,
    Break,
    Grounding,
    Admin,
    Milestone,
    Buffer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarTimeBlock {
    pub id: Uuid,
    pub title: String,
    pub task_id: Option<Uuid>,
    pub quadrant_item_id: Option<Uuid>,
    pub start_at: Iso8601,
    pub end_at: Iso8601,
    pub all_day: bool,
    pub kind: BlockKind,
    pub color_token: String,
    pub notes: Option<String>,
    pub created_at: Iso8601,
    pub updated_at: Iso8601,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsistencyMetric {
    pub schema_version: u32,
    pub daily_target_minutes: u32,
    pub current_streak_days: u32,
    pub longest_streak_days: u32,
    pub streak_anchor_date: Option<String>,
    pub today_focus_ms: u64,
    pub today_completion_percent: u32,
    pub last_recalculated_at: Iso8601,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub schema_version: u32,
    pub pomodoro_focus_minutes: u32,
    pub pomodoro_short_break_minutes: u32,
    pub pomodoro_long_break_minutes: u32,
    pub pomodoro_cycle_length: u32,
    pub hud_auto_show_on_session_start: bool,
    pub colored_time_blocks: bool,
    #[serde(default = "default_prompt_task_on_block")]
    pub prompt_task_on_block_create: bool,
    pub active_widgets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetLayout {
    pub schema_version: u32,
    pub widget_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaFile {
    pub schema_version: u32,
    pub app_version: String,
    pub created_at: Iso8601,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimerPhase {
    Idle,
    Focus,
    ShortBreak,
    LongBreak,
    Stopwatch,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimerRunState {
    Idle,
    Running,
    Paused,
    Completed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Discontinuity {
    None,
    SystemSuspend,
    ClockChange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSession {
    pub session_id: Uuid,
    pub phase: TimerPhase,
    pub run_state: TimerRunState,
    pub anchor_at: Iso8601,
    pub anchor_mono_ms: u64,
    pub accumulated_pause_ms: u64,
    pub paused_at: Option<Iso8601>,
    pub phase_duration_ms: Option<u64>,
    pub phase_index: u32,
    pub cycle_length: u32,
    pub protocol: String,
    /// Overrides the configured focus length for this session only.
    #[serde(default)]
    pub custom_focus_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerTickPayload {
    pub session_id: Uuid,
    pub phase: TimerPhase,
    pub run_state: TimerRunState,
    pub anchor_at: Iso8601,
    pub elapsed_ms: u64,
    pub remaining_ms: Option<u64>,
    pub phase_duration_ms: Option<u64>,
    pub phase_index: u32,
    pub cycle_length: u32,
    pub discontinuity: Discontinuity,
}

pub fn now_iso() -> Iso8601 {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn default_prompt_task_on_block() -> bool {
    true
}

pub fn new_uuid() -> Uuid {
    uuid::Uuid::new_v4().to_string()
}

pub fn parse_iso(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| e.to_string())
}
