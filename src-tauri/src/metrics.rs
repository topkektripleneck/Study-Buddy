use chrono::Local;

use crate::error::AppError;
use crate::models::{now_iso, ConsistencyMetric, DailyFocus};
use crate::storage::StorageEngine;

/// How far back streak history is scanned. Roughly a year.
const HISTORY_DAYS: u32 = 370;

/// Recomputes every derived consistency number from the activity log and persists it.
/// The activity log is the source of truth; `metrics.json` is only a cache.
pub fn recalculate(storage: &StorageEngine) -> Result<ConsistencyMetric, AppError> {
    let mut metric = storage.read_metrics()?;
    let target_minutes = metric.daily_target_minutes.max(1);
    let history = storage.daily_focus_totals(HISTORY_DAYS, target_minutes);

    let today = Local::now().format("%Y-%m-%d").to_string();
    let today_focus_ms = history
        .iter()
        .find(|day| day.date == today)
        .map(|day| day.focus_ms)
        .unwrap_or(0);

    let target_ms = target_minutes as u64 * 60_000;
    let percent = ((today_focus_ms as f64 / target_ms as f64) * 100.0).round() as u32;

    metric.today_focus_ms = today_focus_ms;
    metric.today_completion_percent = percent.min(100);
    metric.current_streak_days = current_streak(&history);
    metric.longest_streak_days = longest_streak(&history).max(metric.current_streak_days);
    metric.streak_anchor_date = streak_anchor(&history);
    metric.last_recalculated_at = now_iso();

    storage.write_metrics(&metric)?;
    Ok(metric)
}

/// Counts back from today. Today not yet meeting the target does not break the
/// streak - the day is still in progress - but a missed yesterday does.
fn current_streak(history: &[DailyFocus]) -> u32 {
    let mut streak = 0;
    for (offset, day) in history.iter().rev().enumerate() {
        if day.met_target {
            streak += 1;
        } else if offset == 0 {
            continue;
        } else {
            break;
        }
    }
    streak
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

fn streak_anchor(history: &[DailyFocus]) -> Option<String> {
    let streak = current_streak(history) as usize;
    if streak == 0 {
        return None;
    }
    history
        .iter()
        .rev()
        .filter(|day| day.met_target)
        .take(streak)
        .last()
        .map(|day| day.date.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(date: &str, met: bool) -> DailyFocus {
        DailyFocus {
            date: date.to_string(),
            focus_ms: if met { 7_200_000 } else { 0 },
            met_target: met,
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
        assert_eq!(current_streak(&history), 3);
    }

    #[test]
    fn streak_breaks_on_a_missed_yesterday() {
        let history = vec![
            day("2026-08-24", true),
            day("2026-08-25", true),
            day("2026-08-26", false),
            day("2026-08-27", true),
        ];
        assert_eq!(current_streak(&history), 1);
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
}
