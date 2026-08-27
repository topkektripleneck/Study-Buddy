use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use chrono::Utc;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::models::{
    parse_iso, AppConfig, Discontinuity, TimerPhase, TimerRunState, TimerSession, TimerTickPayload,
    now_iso, new_uuid,
};
use crate::storage::{mono_ms, StorageEngine};

static SUBSCRIBER_ID: AtomicU64 = AtomicU64::new(1);

struct Subscriber {
    id: u64,
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
        let actor = Arc::new(Self {
            storage: storage.clone(),
            app: app.clone(),
            inner: Mutex::new(TimerInner {
                session: storage.read_session().ok().flatten(),
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
        let id = SUBSCRIBER_ID.fetch_add(1, Ordering::Relaxed);
        self.subscribers.lock().push(Subscriber { id, channel });
        if let Some(tick) = self.compute_tick(None) {
            let _ = self.push_tick(&tick);
        }
    }

    pub fn get_tick(&self) -> Option<TimerTickPayload> {
        self.compute_tick(None)
    }

    pub fn app(&self) -> &AppHandle {
        &self.app
    }

    pub fn start(&self, protocol: Option<String>) -> Result<TimerTickPayload, AppError> {
        let mut inner = self.inner.lock();
        let config = inner.config.clone();
        let protocol = protocol.unwrap_or_else(|| "pomodoro".to_string());
        let phase = if protocol == "stopwatch" {
            TimerPhase::Stopwatch
        } else {
            TimerPhase::Focus
        };
        let duration = phase_duration(&config, phase);

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
        };

        inner.session = Some(session.clone());
        drop(inner);
        self.persist_session()?;
        self.emit_phase(None, session.phase);
        self.compute_tick(None).ok_or_else(|| AppError::Timer("no tick".into()))
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
        self.compute_tick(None).ok_or_else(|| AppError::Timer("no tick".into()))
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
                let now = Utc::now();
                let pause_ms = (now - paused).num_milliseconds().max(0) as u64;
                session.accumulated_pause_ms += pause_ms;
            }
        }
        session.run_state = TimerRunState::Running;
        drop(inner);
        self.persist_session()?;
        self.compute_tick(None).ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn reset(&self) -> Result<(), AppError> {
        self.inner.lock().session = None;
        self.storage.clear_session()?;
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
        session.phase = next;
        session.phase_index += 1;
        session.run_state = TimerRunState::Running;
        session.accumulated_pause_ms = 0;
        session.paused_at = None;
        session.phase_duration_ms = phase_duration(&config, session.phase);
        let to = session.phase;
        drop(inner);
        self.persist_session()?;
        self.emit_phase(Some(from), to);
        self.compute_tick(None).ok_or_else(|| AppError::Timer("no tick".into()))
    }

    pub fn update_config(&self, config: AppConfig) {
        self.inner.lock().config = config;
    }

    fn tick_loop(self: Arc<Self>) {
        loop {
            thread::sleep(Duration::from_millis(200));
            if let Some(tick) = self.compute_tick(Some(200)) {
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
        if tick.run_state != TimerRunState::Running {
            return;
        }
        if tick.phase == TimerPhase::Stopwatch {
            return;
        }
        if let (Some(remaining), Some(_)) = (tick.remaining_ms, tick.phase_duration_ms) {
            if remaining == 0 {
                let _ = self.skip_phase();
            }
        }
    }

    fn compute_tick(&self, mono_delta_hint: Option<u64>) -> Option<TimerTickPayload> {
        let inner = self.inner.lock();
        let session = inner.session.as_ref()?;

        let mut discontinuity = Discontinuity::None;
        if session.run_state == TimerRunState::Running {
            if let Ok(anchor) = parse_iso(&session.anchor_at) {
                let wall_ms = (Utc::now() - anchor).num_milliseconds().max(0) as u64;
                let mono_ms_now = mono_ms();
                let mono_delta = mono_ms_now.saturating_sub(session.anchor_mono_ms);
                if mono_delta_hint.is_some() {
                    let diff = (wall_ms as i64 - mono_delta as i64).unsigned_abs();
                    if diff > 2000 {
                        discontinuity = Discontinuity::SystemSuspend;
                    }
                }
                let elapsed_ms = wall_ms.saturating_sub(session.accumulated_pause_ms);
                let remaining_ms = session.phase_duration_ms.map(|d| d.saturating_sub(elapsed_ms));

                return Some(TimerTickPayload {
                    session_id: session.session_id.clone(),
                    phase: session.phase,
                    run_state: session.run_state,
                    anchor_at: session.anchor_at.clone(),
                    elapsed_ms,
                    remaining_ms,
                    phase_duration_ms: session.phase_duration_ms,
                    phase_index: session.phase_index,
                    cycle_length: session.cycle_length,
                    discontinuity,
                });
            }
        }

        let elapsed_ms = if session.run_state == TimerRunState::Paused {
            session
                .paused_at
                .as_ref()
                .and_then(|p| parse_iso(p).ok())
                .and_then(|paused| parse_iso(&session.anchor_at).ok().map(|anchor| {
                    (paused - anchor).num_milliseconds().max(0) as u64
                }))
                .unwrap_or(0)
                .saturating_sub(session.accumulated_pause_ms)
        } else {
            0
        };

        Some(TimerTickPayload {
            session_id: session.session_id.clone(),
            phase: session.phase,
            run_state: session.run_state,
            anchor_at: session.anchor_at.clone(),
            elapsed_ms,
            remaining_ms: session.phase_duration_ms.map(|d| d.saturating_sub(elapsed_ms)),
            phase_duration_ms: session.phase_duration_ms,
            phase_index: session.phase_index,
            cycle_length: session.cycle_length,
            discontinuity,
        })
    }

    fn push_tick(&self, tick: &TimerTickPayload) -> Result<(), AppError> {
        let mut subs = self.subscribers.lock();
        subs.retain(|sub| sub.channel.send(tick.clone()).is_ok());
        let _ = self.app.emit("timer:tick", tick);
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
        if let Some(s) = session {
            self.storage.write_session(&s)?;
        } else {
            self.storage.clear_session()?;
        }
        Ok(())
    }

    fn emit_phase(&self, from: Option<TimerPhase>, to: TimerPhase) {
        let session_id = self
            .inner
            .lock()
            .session
            .as_ref()
            .map(|s| s.session_id.clone())
            .unwrap_or_default();
        let _ = self.app.emit(
            "timer:phase",
            serde_json::json!({
                "sessionId": session_id,
                "from": from,
                "to": to,
                "at": now_iso(),
                "autoStarted": true
            }),
        );
    }
}

fn phase_duration(config: &AppConfig, phase: TimerPhase) -> Option<u64> {
    let minutes = match phase {
        TimerPhase::Focus => config.pomodoro_focus_minutes,
        TimerPhase::ShortBreak => config.pomodoro_short_break_minutes,
        TimerPhase::LongBreak => config.pomodoro_long_break_minutes,
        TimerPhase::Stopwatch | TimerPhase::Idle => return None,
    };
    Some(minutes as u64 * 60_000)
}

fn next_phase(config: &AppConfig, session: &TimerSession) -> TimerPhase {
    match session.phase {
        TimerPhase::Focus => {
            if (session.phase_index + 1) % config.pomodoro_cycle_length == 0 {
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
