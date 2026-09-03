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
    TimerPhase, TimerRestoreOffer, TimerRunState, TimerSession, TimerTickPayload,
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
    pending_restore: Option<TimerSession>,
    suspend_notice_ms: Option<u64>,
    config: AppConfig,
}

impl TimerActor {
    pub fn new(storage: Arc<StorageEngine>, app: AppHandle, config: AppConfig) -> Arc<Self> {
        let restored = storage.read_session().ok().flatten();
        let (session, pending_restore) = match restored {
            Some(s) if s.phase != TimerPhase::Idle => (None, Some(s)),
            Some(_) => {
                let _ = storage.clear_session();
                (None, None)
            }
            None => (None, None),
        };

        let actor = Arc::new(Self {
            storage: storage.clone(),
            app: app.clone(),
            inner: Mutex::new(TimerInner {
                session,
                pending_restore,
                suspend_notice_ms: None,
                config,
            }),
            subscribers: Mutex::new(vec![]),
            last_checkpoint: Mutex::new(Instant::now()),
        });

        if let Some(offer) = actor.restore_offer() {
            let _ = app.emit("timer:restore-pending", &offer);
        }

        let tick_actor = actor.clone();
        thread::spawn(move || tick_actor.tick_loop());

        actor
    }

    fn restore_offer(&self) -> Option<TimerRestoreOffer> {
        let inner = self.inner.lock();
        let session = inner.pending_restore.as_ref()?;
        let elapsed_ms = session_elapsed_ms(session);
        Some(TimerRestoreOffer {
            session_id: session.session_id.clone(),
            phase: session.phase,
            elapsed_ms,
            remaining_ms: session
                .phase_duration_ms
                .map(|d| d.saturating_sub(elapsed_ms)),
            phase_duration_ms: session.phase_duration_ms,
            protocol: session.protocol.clone(),
        })
    }

    pub fn get_pending_restore(&self) -> Option<TimerRestoreOffer> {
        self.restore_offer()
    }

    /// Re-read session and config from disk after a backup restore.
    pub fn reload_from_storage(&self) -> Result<(), AppError> {
        let restored = self.storage.read_session().ok().flatten();
        let config = self.storage.read_config()?;
        let (session, pending_restore) = match restored {
            Some(s) if s.phase != TimerPhase::Idle => (None, Some(s)),
            Some(_) => {
                let _ = self.storage.clear_session();
                (None, None)
            }
            None => (None, None),
        };
        {
            let mut inner = self.inner.lock();
            inner.session = session;
            inner.pending_restore = pending_restore;
            inner.suspend_notice_ms = None;
            inner.config = config;
        }
        if let Some(offer) = self.restore_offer() {
            let _ = self.app.emit("timer:restore-pending", &offer);
        }
        Ok(())
    }

    pub fn confirm_restore(&self) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let mut session = inner
            .pending_restore
            .take()
            .ok_or_else(|| AppError::Timer("no session to restore".into()))?;
        session.run_state = TimerRunState::Paused;
        session.paused_at = Some(now_iso());
        session.anchor_mono_ms = mono_ms();
        inner.session = Some(session);
        drop(inner);
        self.persist_session()?;
        self.compute_tick(false)
            .ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn discard_restore(&self) -> Result<(), AppError> {
        self.inner.lock().pending_restore = None;
        self.storage.clear_session()?;
        Ok(())
    }

    pub fn ack_suspend(&self) -> Result<TimerTickPayload, AppError> {
        self.inner.lock().suspend_notice_ms = None;
        self.resume()
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
        inner.pending_restore = None;
        let config = inner.config.clone();
        let protocol = protocol.unwrap_or_else(|| "pomodoro".to_string());
        let phase = if protocol == "stopwatch" {
            TimerPhase::Stopwatch
        } else {
            TimerPhase::Focus
        };

        let custom_focus_ms = match duration_minutes {
            Some(0) => return Err(AppError::InvalidInput("duration must be > 0".into())),
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
            let config = self.inner.lock().config.clone();
            crate::notify::poll_metrics_notifications(self.app(), &config, &metric);
        }
    }

    pub fn update_config(&self, config: AppConfig) {
        self.inner.lock().config = config;
    }

    /// Final checkpoint before process exit.
    pub fn flush(&self) {
        let _ = self.persist_session();
    }

    fn tick_loop(self: Arc<Self>) {
        loop {
            thread::sleep(Duration::from_millis(200));
            self.maybe_heal_suspend();
            if let Some(tick) = self.compute_tick(true) {
                let _ = self.push_tick(&tick);
                self.maybe_checkpoint();
                self.check_phase_completion(&tick);
            }
            self.maybe_poll_blocks();
            self.maybe_poll_metrics();
        }
    }

    /// Wall-clock gaps from sleep/suspend are excluded from elapsed time.
    fn maybe_heal_suspend(&self) {
        let mut inner = self.inner.lock();
        let gap = {
            let Some(session) = inner.session.as_mut() else {
                return;
            };
            if session.run_state != TimerRunState::Running {
                return;
            }
            let Ok(anchor) = parse_iso(&session.anchor_at) else {
                return;
            };
            let wall_ms = (Utc::now() - anchor).num_milliseconds().max(0) as u64;
            let mono_delta = mono_ms().saturating_sub(session.anchor_mono_ms);
            let adjusted_wall = wall_ms.saturating_sub(session.accumulated_pause_ms);
            if adjusted_wall > mono_delta.saturating_add(2_000) {
                let gap = adjusted_wall - mono_delta;
                session.accumulated_pause_ms += gap;
                session.run_state = TimerRunState::Paused;
                session.paused_at = Some(now_iso());
                Some(gap)
            } else {
                None
            }
        };
        if let Some(gap) = gap {
            inner.suspend_notice_ms = Some(gap);
        }
    }

    fn maybe_poll_blocks(&self) {
        static LAST: OnceLock<Mutex<Instant>> = OnceLock::new();
        let last = LAST.get_or_init(|| Mutex::new(Instant::now() - Duration::from_secs(10)));
        {
            let mut guard = last.lock();
            if guard.elapsed() < Duration::from_millis(1_000) {
                return;
            }
            *guard = Instant::now();
        }
        let config = self.inner.lock().config.clone();
        if !config.notify_blocks {
            return;
        }
        let blocks = match self.storage.read_calendar() {
            Ok(blocks) => blocks,
            Err(_) => return,
        };
        crate::notify::poll_block_notifications(self.app(), &config, &blocks);
    }

    fn maybe_poll_metrics(&self) {
        static LAST: OnceLock<Mutex<Instant>> = OnceLock::new();
        let last = LAST.get_or_init(|| Mutex::new(Instant::now() - Duration::from_secs(120)));
        {
            let mut guard = last.lock();
            if guard.elapsed() < Duration::from_secs(60) {
                return;
            }
            *guard = Instant::now();
        }
        let config = self.inner.lock().config.clone();
        if let Ok(metric) = crate::metrics::recalculate(&self.storage) {
            let _ = self.app.emit("metrics:changed", &metric);
            crate::notify::poll_metrics_notifications(self.app(), &config, &metric);
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
            suspend_gap_ms: inner.suspend_notice_ms,
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
            suspend_gap_ms: None,
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
        let (session_id, duration_ms, config) = {
            let inner = self.inner.lock();
            let config = inner.config.clone();
            match inner.session.as_ref() {
                Some(s) => (s.session_id.clone(), s.phase_duration_ms, config),
                None => (String::new(), None, config),
            }
        };

        if let Some(from_phase) = from {
            crate::notify::notify_timer_phase(self.app(), &config, from_phase, to);
        }

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
            // phase_index increments on every transition; focus phases sit on even indices.
            let focus_completed = session.phase_index / 2 + 1;
            if focus_completed.is_multiple_of(cycle) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppConfig, TimerPhase, TimerRestoreOffer, TimerRunState, TimerSession};

    fn sample_session(phase: TimerPhase, phase_index: u32) -> TimerSession {
        TimerSession {
            session_id: "s".into(),
            phase,
            run_state: TimerRunState::Running,
            anchor_at: now_iso(),
            anchor_mono_ms: 0,
            accumulated_pause_ms: 0,
            paused_at: None,
            phase_duration_ms: Some(25 * 60_000),
            phase_index,
            cycle_length: 4,
            protocol: "pomodoro".into(),
            custom_focus_ms: None,
        }
    }

    #[test]
    fn suspend_heal_adds_gap_once() {
        fn heal_delta(wall_ms: u64, mono_delta: u64, accumulated_pause_ms: u64) -> Option<u64> {
            let adjusted_wall = wall_ms.saturating_sub(accumulated_pause_ms);
            if adjusted_wall > mono_delta.saturating_add(2_000) {
                Some(adjusted_wall - mono_delta)
            } else {
                None
            }
        }

        let wall = 3_600_000u64;
        let mono = 300_000u64;
        assert_eq!(heal_delta(wall, mono, 0), Some(wall - mono));
        let accumulated = wall - mono;
        assert_eq!(heal_delta(wall + 200, mono + 200, accumulated), None);
    }

    #[test]
    fn restore_offer_from_active_session() {
        let session = sample_session(TimerPhase::Focus, 0);
        let elapsed = session_elapsed_ms(&session);
        let offer = TimerRestoreOffer {
            session_id: session.session_id.clone(),
            phase: session.phase,
            elapsed_ms: elapsed,
            remaining_ms: session.phase_duration_ms.map(|d| d.saturating_sub(elapsed)),
            phase_duration_ms: session.phase_duration_ms,
            protocol: session.protocol.clone(),
        };
        assert_eq!(offer.phase, TimerPhase::Focus);
        assert!(offer.remaining_ms.unwrap_or(0) <= 25 * 60_000);
    }

    #[test]
    fn long_break_after_fourth_focus() {
        let config = AppConfig {
            schema_version: 1,
            pomodoro_focus_minutes: 25,
            pomodoro_short_break_minutes: 5,
            pomodoro_long_break_minutes: 15,
            pomodoro_cycle_length: 4,
            hud_auto_show_on_session_start: true,
            colored_time_blocks: true,
            prompt_task_on_block_create: true,
            notify_timer: true,
            notify_blocks: true,
            theme_id: "galaxy".into(),
            zodiac_sign: "leo".into(),
            active_widgets: vec![],
            focus_start_chime_path: None,
            focus_end_chime_path: None,
            notify_quiet_hours_enabled: false,
            notify_quiet_start_hour: 22,
            notify_quiet_end_hour: 8,
            eightbit_palette: "green".into(),
            autostart: false,
        };
        assert_eq!(
            next_phase(&config, &sample_session(TimerPhase::Focus, 6)),
            TimerPhase::LongBreak
        );
        assert_eq!(
            next_phase(&config, &sample_session(TimerPhase::Focus, 0)),
            TimerPhase::ShortBreak
        );
    }
}
