use std::collections::HashMap;

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};

use crate::error::AppError;
use crate::models::{BlockKind, BlockRecurrence, CalendarTimeBlock, RecurrenceFrequency, new_uuid, now_iso};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IcsEvent {
    pub summary: String,
    pub description: Option<String>,
    pub start_at: DateTime<Local>,
    pub end_at: DateTime<Local>,
    pub all_day: bool,
    pub recurrence: Option<BlockRecurrence>,
    pub cancelled: bool,
}

pub fn parse(content: &str) -> Result<Vec<IcsEvent>, AppError> {
    let unfolded = unfold_lines(content);
    let mut events = Vec::new();
    let mut in_event = false;
    let mut props: HashMap<String, (HashMap<String, String>, String)> = HashMap::new();

    for line in unfolded {
        if line == "BEGIN:VEVENT" {
            in_event = true;
            props.clear();
            continue;
        }
        if line == "END:VEVENT" {
            if in_event {
                if let Some(event) = event_from_props(&props)? {
                    events.push(event);
                }
            }
            in_event = false;
            props.clear();
            continue;
        }
        if !in_event {
            continue;
        }
        let Some((name, params, value)) = split_property(&line) else {
            continue;
        };
        props.insert(name.to_ascii_uppercase(), (params, value));
    }

    Ok(events)
}

pub fn to_block(event: &IcsEvent) -> CalendarTimeBlock {
    CalendarTimeBlock {
        id: new_uuid(),
        title: event.summary.clone(),
        task_id: None,
        quadrant_item_id: None,
        start_at: event
            .start_at
            .with_timezone(&Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        end_at: event
            .end_at
            .with_timezone(&Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        all_day: event.all_day,
        kind: BlockKind::Focus,
        color_token: "focus".into(),
        notes: event.description.clone(),
        recurrence: event.recurrence.clone(),
        series_id: if event.recurrence.is_some() {
            Some(new_uuid())
        } else {
            None
        },
        created_at: now_iso(),
        updated_at: now_iso(),
    }
}

fn event_from_props(
    props: &HashMap<String, (HashMap<String, String>, String)>,
) -> Result<Option<IcsEvent>, AppError> {
    let status = props
        .get("STATUS")
        .map(|(_, v)| v.as_str())
        .unwrap_or("CONFIRMED");
    if status.eq_ignore_ascii_case("CANCELLED") {
        return Ok(None);
    }

    let (start_params, start_raw) = props
        .get("DTSTART")
        .ok_or_else(|| AppError::InvalidInput("event missing DTSTART".into()))?;
    let (start_at, all_day) = parse_ics_datetime(start_raw, start_params)?;

    let end_at = if let Some((end_params, end_raw)) = props.get("DTEND") {
        let (end, end_all_day) = parse_ics_datetime(end_raw, end_params)?;
        if all_day && end_all_day && end.date_naive() > start_at.date_naive() {
            end - chrono::Duration::days(1)
        } else {
            end
        }
    } else if let Some((_, duration)) = props.get("DURATION") {
        start_at + parse_duration(duration)?
    } else if all_day {
        start_at + chrono::Duration::days(1)
    } else {
        start_at + chrono::Duration::hours(1)
    };

    let summary = props
        .get("SUMMARY")
        .map(|(_, v)| unescape_ics_text(v))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Untitled".into());

    let description = props
        .get("DESCRIPTION")
        .map(|(_, v)| unescape_ics_text(v))
        .filter(|s| !s.is_empty());

    let recurrence = props
        .get("RRULE")
        .and_then(|(_, rule)| parse_rrule(rule));

    Ok(Some(IcsEvent {
        summary,
        description,
        start_at,
        end_at,
        all_day,
        recurrence,
        cancelled: false,
    }))
}

fn unfold_lines(content: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in content.lines() {
        let line = raw.trim_end_matches('\r');
        if (line.starts_with(' ') || line.starts_with('\t')) && !lines.is_empty() {
            lines.last_mut().unwrap().push_str(line.trim_start());
        } else {
            lines.push(line.to_string());
        }
    }
    lines
}

fn split_property(line: &str) -> Option<(&str, HashMap<String, String>, String)> {
    let (head, value) = line.split_once(':')?;
    let mut parts = head.split(';');
    let name = parts.next()?;
    let mut params = HashMap::new();
    for part in parts {
        if let Some((key, val)) = part.split_once('=') {
            params.insert(key.to_ascii_uppercase(), val.to_string());
        }
    }
    Some((name, params, value.to_string()))
}

fn parse_ics_datetime(
    raw: &str,
    params: &HashMap<String, String>,
) -> Result<(DateTime<Local>, bool), AppError> {
    let all_day = params
        .get("VALUE")
        .is_some_and(|v| v.eq_ignore_ascii_case("DATE"))
        || (!raw.contains('T') && raw.len() == 8);

    if all_day {
        let date = NaiveDate::parse_from_str(raw, "%Y%m%d")
            .map_err(|e| AppError::InvalidInput(format!("bad DATE {raw}: {e}")))?;
        let naive = date.and_hms_opt(0, 0, 0).unwrap();
        let local = Local
            .from_local_datetime(&naive)
            .single()
            .ok_or_else(|| AppError::InvalidInput(format!("invalid local date {raw}")))?;
        return Ok((local, true));
    }

    if raw.ends_with('Z') {
        let naive = NaiveDateTime::parse_from_str(raw.trim_end_matches('Z'), "%Y%m%dT%H%M%S")
            .or_else(|_| NaiveDateTime::parse_from_str(raw.trim_end_matches('Z'), "%Y%m%dT%H%M"))
            .map_err(|e| AppError::InvalidInput(format!("bad UTC datetime {raw}: {e}")))?;
        return Ok((Utc.from_utc_datetime(&naive).with_timezone(&Local), false));
    }

    let naive = NaiveDateTime::parse_from_str(raw, "%Y%m%dT%H%M%S")
        .or_else(|_| NaiveDateTime::parse_from_str(raw, "%Y%m%dT%H%M"))
        .map_err(|e| AppError::InvalidInput(format!("bad datetime {raw}: {e}")))?;
    let local = Local
        .from_local_datetime(&naive)
        .single()
        .ok_or_else(|| AppError::InvalidInput(format!("invalid local datetime {raw}")))?;
    Ok((local, false))
}

fn parse_duration(raw: &str) -> Result<chrono::Duration, AppError> {
    let s = raw.to_ascii_uppercase();
    if !s.starts_with("PT") {
        return Err(AppError::InvalidInput(format!("unsupported duration {raw}")));
    }
    let mut hours = 0i64;
    let mut minutes = 0i64;
    let mut num = String::new();
    for ch in s.chars().skip(2) {
        if ch.is_ascii_digit() {
            num.push(ch);
        } else {
            let value: i64 = num.parse().unwrap_or(0);
            num.clear();
            match ch {
                'H' => hours = value,
                'M' => minutes = value,
                _ => {}
            }
        }
    }
    Ok(chrono::Duration::hours(hours) + chrono::Duration::minutes(minutes))
}

fn parse_rrule(raw: &str) -> Option<BlockRecurrence> {
    let mut freq: Option<&str> = None;
    let mut byday: Option<&str> = None;
    for part in raw.split(';') {
        if let Some((key, value)) = part.split_once('=') {
            match key.to_ascii_uppercase().as_str() {
                "FREQ" => freq = Some(value),
                "BYDAY" => byday = Some(value),
                _ => {}
            }
        }
    }
    let freq = freq?;
    if let Some(days) = byday {
        let weekdays = ["MO", "TU", "WE", "TH", "FR"];
        let tokens: Vec<_> = days.split(',').map(|d| d.trim().to_ascii_uppercase()).collect();
        if tokens.len() == 5 && weekdays.iter().all(|d| tokens.iter().any(|t| t.ends_with(d))) {
            return Some(BlockRecurrence {
                frequency: RecurrenceFrequency::Weekdays,
            });
        }
    }
    match freq.to_ascii_uppercase().as_str() {
        "DAILY" => Some(BlockRecurrence {
            frequency: RecurrenceFrequency::Daily,
        }),
        "WEEKLY" => Some(BlockRecurrence {
            frequency: RecurrenceFrequency::Weekly,
        }),
        _ => None,
    }
}

fn unescape_ics_text(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n' | 'N') => out.push('\n'),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some('\\') => out.push('\\'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20250903T140000Z
DTEND:20250903T150000Z
SUMMARY:Team standup
DESCRIPTION:Daily sync
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20250905
DTEND;VALUE=DATE:20250906
SUMMARY:Holiday
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20250901T090000
DTEND:20250901T100000
SUMMARY:Weekday class
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20250901T090000
SUMMARY:Cancelled
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR"#;

    #[test]
    fn parses_google_like_ics() {
        let events = parse(SAMPLE).unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].summary, "Team standup");
        assert_eq!(events[0].description.as_deref(), Some("Daily sync"));
        assert!(!events[0].all_day);
        assert!(events[1].all_day);
        assert_eq!(
            events[2].recurrence.as_ref().map(|r| r.frequency),
            Some(RecurrenceFrequency::Weekdays)
        );
    }

    #[test]
    fn converts_to_calendar_block() {
        let events = parse(SAMPLE).unwrap();
        let block = to_block(&events[0]);
        assert_eq!(block.title, "Team standup");
        assert_eq!(block.kind, BlockKind::Focus);
        assert_eq!(block.color_token, "focus");
    }
}
