use chrono::Local;

use crate::error::AppError;
use crate::models::{now_iso, ConsistencyMetric, DailyFocus};
use crate::storage::StorageEngine;

/// How far back streak history is scanned. Roughly a year.
const HISTORY_DAYS: u32 = 370;

pub struct StreakState {
    pub days: u32,
    pub freeze_used: bool,
    pub dates: Vec<String>,
}

/// Recomputes every derived consistency number from the activity log and persists it.
/// The activity log is the source of truth; `metrics.json` is only a cache.
pub fn recalculate(storage: &StorageEngine) -> Result<ConsistencyMetric, AppError> {
    let metric = snapshot(storage, None)?;
    storage.write_metrics(&metric)?;
    Ok(metric)
}

/// Active time is a display projection, never written into the activity cache.
pub fn snapshot(storage: &StorageEngine, active: Option<(&str, u64)>) -> Result<ConsistencyMetric, AppError> {
    let mut metric = storage.read_metrics()?;
    let target_minutes = metric.daily_target_minutes.max(1);
    let mut history = storage.daily_focus_totals(HISTORY_DAYS, target_minutes)?;
    if let Some((date, elapsed)) = active {
        if let Some(day) = history.iter_mut().find(|day| day.date == date) {
            day.focus_ms = day.focus_ms.saturating_add(elapsed);
            day.met_target = day.focus_ms >= target_minutes as u64 * 60_000;
        }
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_focus_ms = history
        .iter()
        .find(|day| day.date == today)
        .map(|day| day.focus_ms)
        .unwrap_or(0);

    let target_ms = target_minutes as u64 * 60_000;
    let percent = ((today_focus_ms as f64 / target_ms as f64) * 100.0).floor() as u32;

    metric.today_focus_ms = today_focus_ms;
    metric.today_completion_percent = percent.min(100);
    let streak = current_streak_state(&history);
    metric.current_streak_days = metric.streak_override.unwrap_or(streak.days);
    metric.longest_streak_days = longest_streak(&history).max(metric.current_streak_days);
    metric.streak_anchor_date = streak.dates.last().cloned();
    metric.streak_freeze_used = metric.streak_override.is_none() && streak.freeze_used;
    metric.last_recalculated_at = now_iso();

    Ok(metric)
}

/// Marks which days belong to the current automatic streak (including freeze).
pub fn mark_current_streak(history: &mut [DailyFocus]) {
    let streak = current_streak_state(history);
    for day in history.iter_mut() {
        day.in_current_streak = streak.dates.iter().any(|d| d == &day.date);
    }
}

/// Counts back from today. Today not yet meeting the target does not break the
/// streak — the day is still in progress. One missed day in the run is forgiven
/// (a freeze) so a single off day does not reset the count.
pub fn current_streak_state(history: &[DailyFocus]) -> StreakState {
    let mut dates = Vec::new();
    let mut freeze_used = false;
    let mut freeze_available = true;
    let mut met_beyond_freeze = false;

    for (offset, day) in history.iter().rev().enumerate() {
        if day.met_target {
            dates.push(day.date.clone());
            if !freeze_available {
                met_beyond_freeze = true;
            }
            continue;
        }
        if offset == 0 {
            continue;
        }
        if freeze_available {
            freeze_available = false;
            freeze_used = true;
            continue;
        }
        break;
    }

    freeze_used = freeze_used && met_beyond_freeze;

    StreakState {
        days: dates.len() as u32,
        freeze_used,
        dates,
    }
}

fn longest_streak(history: &[DailyFocus]) -> u32 {
    let mut best = 0;
    let mut run = 0;
    for day in history {
        if day.met_target {
            run += 1;
            best = best.max(run);
        } else {
            run = 0;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_time_updates_target_and_streak_without_persisting_or_double_counting() {
        let dir = tempfile::tempdir().unwrap();
        let storage = StorageEngine::new(dir.path().to_path_buf()).unwrap();
        let mut config = storage.read_metrics().unwrap();
        config.daily_target_minutes = 1;
        config.streak_override = None;
        storage.write_metrics(&config).unwrap();
        let today = Local::now().format("%Y-%m-%d").to_string();
        let almost = snapshot(&storage, Some((&today, 59_999))).unwrap();
        assert_eq!(almost.today_completion_percent, 99);
        assert_eq!(almost.current_streak_days, 0);
        for _ in 0..2 {
            let live = snapshot(&storage, Some((&today, 60_000))).unwrap();
            assert_eq!(live.today_focus_ms, 60_000);
            assert_eq!(live.today_completion_percent, 100);
            assert_eq!(live.current_streak_days, 1);
        }
        assert_eq!(storage.read_metrics().unwrap().today_focus_ms, 0);
        assert_eq!(snapshot(&storage, None).unwrap().today_focus_ms, 0);
    }

    fn day(date: &str, met: bool) -> DailyFocus {
        DailyFocus {
            date: date.to_string(),
            focus_ms: if met { 7_200_000 } else { 0 },
            met_target: met,
            in_current_streak: false,
        }
    }

    #[test]
    fn streak_survives_an_unfinished_today() {
        let history = vec![
            day("2026-08-24", true),
            day("2026-08-25", true),
            day("2026-08-26", true),
            day("2026-08-27", false),
        ];
        assert_eq!(current_streak_state(&history).days, 3);
        assert!(!current_streak_state(&history).freeze_used);
    }

    #[test]
    fn freeze_bridges_a_single_missed_day() {
        let history = vec![
            day("2026-08-24", true),
            day("2026-08-25", true),
            day("2026-08-26", false),
            day("2026-08-27", true),
        ];
        let state = current_streak_state(&history);
        assert_eq!(state.days, 3);
        assert!(state.freeze_used);
        assert_eq!(state.dates.last().map(String::as_str), Some("2026-08-24"));
    }

    #[test]
    fn two_misses_break_the_streak() {
        let history = vec![
            day("2026-08-24", true),
            day("2026-08-25", false),
            day("2026-08-26", false),
            day("2026-08-27", true),
        ];
        let state = current_streak_state(&history);
        assert_eq!(state.days, 1);
        assert!(!state.freeze_used);
    }

    #[test]
    fn longest_streak_scans_all_history() {
        let history = vec![
            day("2026-08-21", true),
            day("2026-08-22", true),
            day("2026-08-23", true),
            day("2026-08-24", false),
            day("2026-08-25", true),
        ];
        assert_eq!(longest_streak(&history), 3);
    }

    #[test]
    fn streak_override_sets_custom_streak() {
        let history = vec![day("2026-08-27", true)];
        let calculated = current_streak_state(&history).days;
        assert_eq!(calculated, 1);

        let streak_override = Some(0);
        let effective = streak_override.unwrap_or(calculated);
        assert_eq!(effective, 0);

        let streak_override_custom = Some(42);
        let effective_custom = streak_override_custom.unwrap_or(calculated);
        assert_eq!(effective_custom, 42);
    }
}
