use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use chrono::{Local, Utc};
use parking_lot::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::models::{
    new_uuid, now_iso, parse_iso, ActivityKind, ActivityLogRecord, AppConfig, Discontinuity,
    TimerPhase, TimerRunState, TimerSession, TimerTickPayload,
};
use crate::storage::StorageEngine;

static MONO_START: OnceLock<Instant> = OnceLock::new();

/// Intervals shorter than this are treated as false starts and are not logged.
const MIN_LOGGED_MS: u64 = 30_000;

/// Milliseconds since process start on a monotonic clock. Only meaningful within
/// one run of the process, so restored sessions must be re-anchored.
pub fn mono_ms() -> u64 {
    MONO_START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

struct Subscriber {
    channel: Channel<TimerTickPayload>,
}

pub struct TimerActor {
    storage: Arc<StorageEngine>,
    app: AppHandle,
    inner: Mutex<TimerInner>,
    subscribers: Mutex<Vec<Subscriber>>,
    last_checkpoint: Mutex<Instant>,
}

struct TimerInner {
    session: Option<TimerSession>,
    config: AppConfig,
}

impl TimerActor {
    pub fn new(storage: Arc<StorageEngine>, app: AppHandle, config: AppConfig) -> Arc<Self> {
        let mut restored = storage.read_session().ok().flatten();
        if let Some(session) = restored.as_mut() {
            session.anchor_mono_ms = mono_ms();
        }

        let actor = Arc::new(Self {
            storage: storage.clone(),
            app: app.clone(),
            inner: Mutex::new(TimerInner {
                session: restored,
                config,
            }),
            subscribers: Mutex::new(vec![]),
            last_checkpoint: Mutex::new(Instant::now()),
        });

        let tick_actor = actor.clone();
        thread::spawn(move || tick_actor.tick_loop());

        actor
    }

    pub fn subscribe(&self, channel: Channel<TimerTickPayload>) {
        self.subscribers.lock().push(Subscriber { channel });
        if let Some(tick) = self.compute_tick(false) {
            let _ = self.push_tick(&tick);
        }
    }

    pub fn get_tick(&self) -> Option<TimerTickPayload> {
        self.compute_tick(false)
    }

    pub fn app(&self) -> &AppHandle {
        &self.app
    }

    pub fn start(
        &self,
        protocol: Option<String>,
        duration_minutes: Option<u32>,
    ) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let config = inner.config.clone();
        let protocol = protocol.unwrap_or_else(|| "pomodoro".to_string());
        let phase = if protocol == "stopwatch" {
            TimerPhase::Stopwatch
        } else {
            TimerPhase::Focus
        };

        let custom_focus_ms = match duration_minutes {
            Some(m) if m == 0 => return Err(AppError::InvalidInput("duration must be > 0".into())),
            Some(m) => Some(m as u64 * 60_000),
            None => None,
        };

        let duration = match phase {
            TimerPhase::Focus => custom_focus_ms.or_else(|| phase_duration(&config, phase, None)),
            _ => phase_duration(&config, phase, None),
        };

        let session = TimerSession {
            session_id: new_uuid(),
            phase,
            run_state: TimerRunState::Running,
            anchor_at: now_iso(),
            anchor_mono_ms: mono_ms(),
            accumulated_pause_ms: 0,
            paused_at: None,
            phase_duration_ms: duration,
            phase_index: 0,
            cycle_length: config.pomodoro_cycle_length,
            protocol,
            custom_focus_ms,
        };

        inner.session = Some(session.clone());
        drop(inner);
        self.persist_session()?;
        self.emit_phase(None, session.phase);
        self.compute_tick(false)
            .ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn pause(&self) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let session = inner
            .session
            .as_mut()
            .ok_or_else(|| AppError::Timer("no active session".into()))?;
        if session.run_state != TimerRunState::Running {
            return Err(AppError::Timer("timer not running".into()));
        }
        session.run_state = TimerRunState::Paused;
        session.paused_at = Some(now_iso());
        drop(inner);
        self.persist_session()?;
        self.compute_tick(false)
            .ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn resume(&self) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let session = inner
            .session
            .as_mut()
            .ok_or_else(|| AppError::Timer("no active session".into()))?;
        if session.run_state != TimerRunState::Paused {
            return Err(AppError::Timer("timer not paused".into()));
        }
        if let Some(paused_at) = session.paused_at.take() {
            if let Ok(paused) = parse_iso(&paused_at) {
                let pause_ms = (Utc::now() - paused).num_milliseconds().max(0) as u64;
                session.accumulated_pause_ms += pause_ms;
            }
        }
        session.run_state = TimerRunState::Running;
        drop(inner);
        self.persist_session()?;
        self.compute_tick(false)
            .ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn reset(&self) -> Result<(), AppError> {
        let finished = {
            let mut inner = self.inner.lock();
            inner.session.take().map(|session| {
                let elapsed = session_elapsed_ms(&session);
                (session.phase, session.anchor_at, elapsed, false)
            })
        };

        self.storage.clear_session()?;
        if let Some((phase, started_at, elapsed, completed)) = finished {
            self.record_interval(phase, started_at, elapsed, completed);
        }
        self.broadcast_idle();
        Ok(())
    }

    pub fn skip_phase(&self) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let config = inner.config.clone();
        let session = inner
            .session
            .as_mut()
            .ok_or_else(|| AppError::Timer("no active session".into()))?;

        let from = session.phase;
        let next = next_phase(&config, session);
        let custom_focus_ms = session.custom_focus_ms;

        let leaving = {
            let elapsed = session_elapsed_ms(session);
            let ran_to_completion = session
                .phase_duration_ms
                .map(|duration| elapsed >= duration)
                .unwrap_or(false);
            (from, session.anchor_at.clone(), elapsed, ran_to_completion)
        };

        session.phase = next;
        session.phase_index += 1;
        session.run_state = TimerRunState::Running;
        // Re-anchor: elapsed time is measured from the start of the current phase.
        session.anchor_at = now_iso();
        session.anchor_mono_ms = mono_ms();
        session.accumulated_pause_ms = 0;
        session.paused_at = None;
        session.phase_duration_ms = phase_duration(&config, next, custom_focus_ms);
        let to = session.phase;

        drop(inner);
        self.persist_session()?;

        let (phase, started_at, elapsed, completed) = leaving;
        self.record_interval(phase, started_at, elapsed, completed);

        self.emit_phase(Some(from), to);
        self.compute_tick(false)
            .ok_or_else(|| AppError::Timer("no tick".into()))
    }

    fn record_interval(
        &self,
        phase: TimerPhase,
        started_at: String,
        elapsed_ms: u64,
        ran_to_completion: bool,
    ) {
        let kind = match phase {
            TimerPhase::Focus => ActivityKind::Focus,
            TimerPhase::Stopwatch => ActivityKind::Stopwatch,
            _ => return,
        };
        if elapsed_ms < MIN_LOGGED_MS {
            return;
        }

        let local_date = parse_iso(&started_at)
            .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d").to_string())
            .unwrap_or_else(|_| Local::now().format("%Y-%m-%d").to_string());

        let record = ActivityLogRecord {
            id: new_uuid(),
            kind,
            started_at,
            ended_at: now_iso(),
            duration_ms: elapsed_ms,
            ran_to_completion,
            local_date,
        };

        if self.storage.append_activity(&record).is_ok() {
            self.refresh_metrics();
        }
    }

    pub fn refresh_metrics(&self) {
        if let Ok(metric) = crate::metrics::recalculate(&self.storage) {
            let _ = self.app.emit("metrics:changed", &metric);
        }
    }

    pub fn update_config(&self, config: AppConfig) {
        self.inner.lock().config = config;
    }

    fn tick_loop(self: Arc<Self>) {
        loop {
            thread::sleep(Duration::from_millis(200));
            if let Some(tick) = self.compute_tick(true) {
                let _ = self.push_tick(&tick);
                self.maybe_checkpoint();
                self.check_phase_completion(&tick);
            }
        }
    }

    fn maybe_checkpoint(&self) {
        let mut last = self.last_checkpoint.lock();
        if last.elapsed() >= Duration::from_secs(5) {
            let _ = self.persist_session();
            *last = Instant::now();
        }
    }

    fn check_phase_completion(&self, tick: &TimerTickPayload) {
        if tick.run_state != TimerRunState::Running || tick.phase == TimerPhase::Stopwatch {
            return;
        }
        if let Some(0) = tick.remaining_ms {
            let _ = self.skip_phase();
        }
    }

    fn compute_tick(&self, detect_discontinuity: bool) -> Option<TimerTickPayload> {
        let inner = self.inner.lock();
        let session = inner.session.as_ref()?;
        let anchor = parse_iso(&session.anchor_at).ok()?;
        let elapsed_ms = session_elapsed_ms(session);

        let mut discontinuity = Discontinuity::None;
        if detect_discontinuity && session.run_state == TimerRunState::Running {
            let wall_ms = (Utc::now() - anchor).num_milliseconds().max(0) as u64;
            let mono_delta = mono_ms().saturating_sub(session.anchor_mono_ms);
            if (wall_ms as i64 - mono_delta as i64).unsigned_abs() > 2_000 {
                discontinuity = Discontinuity::SystemSuspend;
            }
        }

        Some(TimerTickPayload {
            session_id: session.session_id.clone(),
            phase: session.phase,
            run_state: session.run_state,
            anchor_at: session.anchor_at.clone(),
            elapsed_ms,
            remaining_ms: session
                .phase_duration_ms
                .map(|d| d.saturating_sub(elapsed_ms)),
            phase_duration_ms: session.phase_duration_ms,
            phase_index: session.phase_index,
            cycle_length: session.cycle_length,
            discontinuity,
        })
    }

    fn push_tick(&self, tick: &TimerTickPayload) -> Result<(), AppError> {
        let mut subs = self.subscribers.lock();
        subs.retain(|sub| sub.channel.send(tick.clone()).is_ok());
        Ok(())
    }

    fn broadcast_idle(&self) {
        let idle = TimerTickPayload {
            session_id: new_uuid(),
            phase: TimerPhase::Idle,
            run_state: TimerRunState::Idle,
            anchor_at: now_iso(),
            elapsed_ms: 0,
            remaining_ms: None,
            phase_duration_ms: None,
            phase_index: 0,
            cycle_length: 4,
            discontinuity: Discontinuity::None,
        };
        let _ = self.push_tick(&idle);
    }

    fn persist_session(&self) -> Result<(), AppError> {
        let session = self.inner.lock().session.clone();
        match session {
            Some(s) => self.storage.write_session(&s),
            None => self.storage.clear_session(),
        }
    }

    fn emit_phase(&self, from: Option<TimerPhase>, to: TimerPhase) {
        let (session_id, duration_ms) = {
            let inner = self.inner.lock();
            match inner.session.as_ref() {
                Some(s) => (s.session_id.clone(), s.phase_duration_ms),
                None => (String::new(), None),
            }
        };

        let _ = self.app.emit(
            "timer:phase",
            serde_json::json!({
                "sessionId": session_id,
                "from": from,
                "to": to,
                "at": now_iso(),
                "phaseDurationMs": duration_ms,
                "autoStarted": true
            }),
        );
    }
}

/// Time spent in the current phase, excluding paused stretches.
fn session_elapsed_ms(session: &TimerSession) -> u64 {
    let Ok(anchor) = parse_iso(&session.anchor_at) else {
        return 0;
    };

    let raw_ms = match session.run_state {
        TimerRunState::Running => (Utc::now() - anchor).num_milliseconds().max(0) as u64,
        TimerRunState::Paused => session
            .paused_at
            .as_ref()
            .and_then(|paused_at| parse_iso(paused_at).ok())
            .map(|paused| (paused - anchor).num_milliseconds().max(0) as u64)
            .unwrap_or(0),
        TimerRunState::Idle | TimerRunState::Completed => return 0,
    };

    raw_ms.saturating_sub(session.accumulated_pause_ms)
}

fn phase_duration(
    config: &AppConfig,
    phase: TimerPhase,
    custom_focus_ms: Option<u64>,
) -> Option<u64> {
    let minutes = match phase {
        TimerPhase::Focus => {
            if let Some(ms) = custom_focus_ms {
                return Some(ms);
            }
            config.pomodoro_focus_minutes
        }
        TimerPhase::ShortBreak => config.pomodoro_short_break_minutes,
        TimerPhase::LongBreak => config.pomodoro_long_break_minutes,
        TimerPhase::Stopwatch | TimerPhase::Idle => return None,
    };
    Some(minutes as u64 * 60_000)
}

fn next_phase(config: &AppConfig, session: &TimerSession) -> TimerPhase {
    match session.phase {
        TimerPhase::Focus => {
            let cycle = config.pomodoro_cycle_length.max(1);
            if (session.phase_index + 1) % cycle == 0 {
                TimerPhase::LongBreak
            } else {
                TimerPhase::ShortBreak
            }
        }
        TimerPhase::ShortBreak | TimerPhase::LongBreak => TimerPhase::Focus,
        TimerPhase::Stopwatch => TimerPhase::Stopwatch,
        TimerPhase::Idle => TimerPhase::Focus,
    }
}
