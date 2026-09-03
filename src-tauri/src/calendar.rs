use chrono::{DateTime, Datelike, Duration, Local, TimeZone, Utc, Weekday};

use crate::models::{
    parse_iso, CalendarTimeBlock, RecurrenceFrequency, new_uuid, now_iso,
};

const RECURRENCE_WEEKS: u32 = 12;

pub fn block_overlaps(existing: &[CalendarTimeBlock], candidate: &CalendarTimeBlock) -> bool {
    let Ok(start) = parse_iso(&candidate.start_at) else {
        return false;
    };
    let Ok(end) = parse_iso(&candidate.end_at) else {
        return false;
    };
    existing.iter().any(|block| {
        if block.id == candidate.id {
            return false;
        }
        let Ok(block_start) = parse_iso(&block.start_at) else {
            return false;
        };
        let Ok(block_end) = parse_iso(&block.end_at) else {
            return false;
        };
        block_start < end && block_end > start
    })
}

pub fn expand_recurring(anchor: &CalendarTimeBlock) -> Vec<CalendarTimeBlock> {
    let Some(recurrence) = &anchor.recurrence else {
        return vec![];
    };
    let Ok(start) = parse_iso(&anchor.start_at) else {
        return vec![];
    };
    let Ok(end) = parse_iso(&anchor.end_at) else {
        return vec![];
    };
    let duration = end - start;
    let series_id = anchor
        .series_id
        .clone()
        .unwrap_or_else(|| anchor.id.clone());

    let mut instances = vec![];
    match recurrence.frequency {
        RecurrenceFrequency::Daily => {
            for day in 1..=(RECURRENCE_WEEKS * 7) {
                let instance_start = start + Duration::days(day as i64);
                instances.push(instance_from_anchor(
                    anchor,
                    instance_start,
                    duration,
                    &series_id,
                ));
            }
        }
        RecurrenceFrequency::Weekly => {
            for week in 1..RECURRENCE_WEEKS {
                let instance_start = start + Duration::weeks(week as i64);
                instances.push(instance_from_anchor(
                    anchor,
                    instance_start,
                    duration,
                    &series_id,
                ));
            }
        }
        RecurrenceFrequency::Weekdays => {
            let local_start = start.with_timezone(&Local);
            let local_time = local_start.time();
            let mut cursor = local_start.date_naive().succ_opt().unwrap_or(local_start.date_naive());
            let last = local_start.date_naive() + Duration::weeks(RECURRENCE_WEEKS as i64);
            while cursor <= last {
                if matches!(
                    cursor.weekday(),
                    Weekday::Mon | Weekday::Tue | Weekday::Wed | Weekday::Thu | Weekday::Fri
                ) {
                    let naive = cursor.and_time(local_time);
                    if let Some(local_dt) = Local.from_local_datetime(&naive).single() {
                        let instance_start = local_dt.with_timezone(&Utc);
                        if instance_start > start {
                            instances.push(instance_from_anchor(
                                anchor,
                                instance_start,
                                duration,
                                &series_id,
                            ));
                        }
                    }
                }
                cursor = match cursor.succ_opt() {
                    Some(next) => next,
                    None => break,
                };
            }
        }
    }

    instances
}

pub fn append_block(blocks: &mut Vec<CalendarTimeBlock>, block: CalendarTimeBlock) {
    if block.recurrence.is_some() {
        let series_id = block.series_id.clone().unwrap_or_else(new_uuid);
        let mut block = block;
        block.series_id = Some(series_id);
        blocks.push(block.clone());
        for instance in expand_recurring(&block) {
            if !block_overlaps(blocks, &instance) {
                blocks.push(instance);
            }
        }
    } else {
        blocks.push(block);
    }
}

fn instance_from_anchor(
    anchor: &CalendarTimeBlock,
    start: DateTime<Utc>,
    duration: Duration,
    series_id: &str,
) -> CalendarTimeBlock {
    let end = start + duration;
    CalendarTimeBlock {
        id: new_uuid(),
        title: anchor.title.clone(),
        task_id: None,
        quadrant_item_id: anchor.quadrant_item_id.clone(),
        start_at: start.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        end_at: end.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        all_day: anchor.all_day,
        kind: anchor.kind,
        color_token: anchor.color_token.clone(),
        notes: anchor.notes.clone(),
        recurrence: None,
        series_id: Some(series_id.to_string()),
        created_at: now_iso(),
        updated_at: now_iso(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BlockKind, BlockRecurrence};

    fn sample_anchor(freq: RecurrenceFrequency) -> CalendarTimeBlock {
        CalendarTimeBlock {
            id: "anchor".into(),
            title: "Study".into(),
            task_id: None,
            quadrant_item_id: None,
            start_at: "2026-09-01T09:00:00.000Z".into(),
            end_at: "2026-09-01T10:00:00.000Z".into(),
            all_day: false,
            kind: BlockKind::Focus,
            color_token: "focus".into(),
            notes: None,
            recurrence: Some(BlockRecurrence { frequency: freq }),
            series_id: None,
            created_at: now_iso(),
            updated_at: now_iso(),
        }
    }

    #[test]
    fn weekly_recurrence_generates_instances() {
        let instances = expand_recurring(&sample_anchor(RecurrenceFrequency::Weekly));
        assert_eq!(instances.len(), 11);
        assert!(instances.iter().all(|b| b.series_id.as_deref() == Some("anchor")));
    }
}
