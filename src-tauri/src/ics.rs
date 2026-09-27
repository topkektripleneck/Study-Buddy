use std::collections::HashMap;
use std::time::Duration as StdDuration;

use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Utc};

use crate::calendar::append_block;
use crate::error::AppError;
use crate::models::{
    now_iso, BlockKind, BlockRecurrence, CalendarImportResult, CalendarTimeBlock, RecurrenceFrequency,
    new_uuid,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IcsEvent {
    pub uid: Option<String>,
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
        external_uid: event.uid.clone(),
        sync_source: event.uid.as_ref().map(|_| "gcal".into()),
        locally_edited: false,
    }
}

/// Inserts, updates, or removes local blocks from parsed ICS events.
/// Locally edited synced blocks are left alone.
pub fn merge_events(
    blocks: &mut Vec<CalendarTimeBlock>,
    events: &[IcsEvent],
) -> CalendarImportResult {
    let mut imported = 0u32;
    let mut updated = 0u32;
    let mut skipped = 0u32;
    let mut removed = 0u32;

    for event in events {
        if event.cancelled {
            if let Some(uid) = event.uid.as_deref() {
                let before = blocks.len();
                blocks.retain(|b| {
                    if b.external_uid.as_deref() == Some(uid) && !b.locally_edited {
                        return false;
                    }
                    true
                });
                if blocks.len() < before {
                    removed += (before - blocks.len()) as u32;
                } else {
                    skipped += 1;
                }
            }
            continue;
        }

        let incoming = to_block(event);
        if let Some(uid) = event.uid.as_deref() {
            if let Some(existing) = blocks
                .iter_mut()
                .find(|b| b.external_uid.as_deref() == Some(uid))
            {
                if existing.locally_edited {
                    skipped += 1;
                    continue;
                }
                existing.title = incoming.title;
                existing.start_at = incoming.start_at;
                existing.end_at = incoming.end_at;
                existing.all_day = incoming.all_day;
                existing.notes = incoming.notes;
                existing.recurrence = incoming.recurrence;
                existing.updated_at = now_iso();
                updated += 1;
                continue;
            }
        }

        if blocks
            .iter()
            .any(|b| b.title == incoming.title && b.start_at == incoming.start_at)
        {
            skipped += 1;
            continue;
        }

        append_block(blocks, incoming);
        imported += 1;
    }

    let message = sync_message(imported, updated, skipped, removed);
    CalendarImportResult {
        imported,
        updated,
        skipped,
        removed,
        message,
    }
}

pub fn sync_message(imported: u32, updated: u32, skipped: u32, removed: u32) -> String {
    if imported == 0 && updated == 0 && removed == 0 {
        return if skipped > 0 {
            format!("No new events ({skipped} already in your calendar)")
        } else {
            "No events to import".into()
        };
    }
    let mut parts = Vec::new();
    if imported > 0 {
        parts.push(format!("{imported} added"));
    }
    if updated > 0 {
        parts.push(format!("{updated} updated"));
    }
    if removed > 0 {
        parts.push(format!("{removed} removed"));
    }
    if skipped > 0 {
        parts.push(format!("{skipped} skipped"));
    }
    format!("Calendar sync: {}", parts.join(", "))
}

pub fn export_ics(blocks: &[CalendarTimeBlock]) -> String {
    let mut out = String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Study Buddy//EN\r\nCALSCALE:GREGORIAN\r\n");
    for block in blocks {
        if block.recurrence.is_none() && block.series_id.is_some() {
            // Expanded instances of a local series — skip; the anchor is enough.
            continue;
        }
        out.push_str("BEGIN:VEVENT\r\n");
        let uid = block
            .external_uid
            .clone()
            .unwrap_or_else(|| format!("{}@study-buddy.local", block.id));
        push_ics_line(&mut out, "UID", &uid);
        push_ics_line(&mut out, "DTSTAMP", &format_ics_utc(&Utc::now()));
        if block.all_day {
            let start = DateTime::parse_from_rfc3339(&block.start_at)
                .map(|d| d.with_timezone(&Local).date_naive())
                .unwrap_or_else(|_| Local::now().date_naive());
            let end = DateTime::parse_from_rfc3339(&block.end_at)
                .map(|d| d.with_timezone(&Local).date_naive())
                .unwrap_or(start + Duration::days(1));
            push_ics_line(
                &mut out,
                "DTSTART;VALUE=DATE",
                &start.format("%Y%m%d").to_string(),
            );
            let end_exclusive = if end <= start { start + Duration::days(1) } else { end };
            push_ics_line(
                &mut out,
                "DTEND;VALUE=DATE",
                &end_exclusive.format("%Y%m%d").to_string(),
            );
        } else if let (Ok(start), Ok(end)) = (
            DateTime::parse_from_rfc3339(&block.start_at),
            DateTime::parse_from_rfc3339(&block.end_at),
        ) {
            push_ics_line(
                &mut out,
                "DTSTART",
                &format_ics_utc(&start.with_timezone(&Utc)),
            );
            push_ics_line(&mut out, "DTEND", &format_ics_utc(&end.with_timezone(&Utc)));
        }
        push_ics_line(&mut out, "SUMMARY", &escape_ics_text(&block.title));
        if let Some(notes) = &block.notes {
            if !notes.is_empty() {
                push_ics_line(&mut out, "DESCRIPTION", &escape_ics_text(notes));
            }
        }
        if let Some(rec) = &block.recurrence {
            let rrule = match rec.frequency {
                RecurrenceFrequency::Daily => "FREQ=DAILY",
                RecurrenceFrequency::Weekly => "FREQ=WEEKLY",
                RecurrenceFrequency::Weekdays => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
            };
            push_ics_line(&mut out, "RRULE", rrule);
        }
        out.push_str("END:VEVENT\r\n");
    }
    out.push_str("END:VCALENDAR\r\n");
    out
}

pub fn validate_gcal_url(raw: &str) -> Result<String, AppError> {
    let url = raw.trim();
    if !url.starts_with("https://") {
        return Err(AppError::InvalidInput(
            "Use the secret HTTPS iCal URL from Google Calendar settings".into(),
        ));
    }
    let host = url
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = host == "calendar.google.com"
        || host == "www.google.com"
        || host.ends_with(".google.com")
        || host.ends_with(".googleusercontent.com");
    if !allowed {
        return Err(AppError::InvalidInput(
            "Only Google Calendar iCal URLs are allowed (calendar.google.com)".into(),
        ));
    }
    Ok(url.to_string())
}

pub fn fetch_ics(url: &str) -> Result<String, AppError> {
    let url = validate_gcal_url(url)?;
    let response = ureq::get(&url)
        .timeout(StdDuration::from_secs(20))
        .set("User-Agent", "StudyBuddy/0.2")
        .call()
        .map_err(|e| AppError::Storage(format!("calendar fetch failed: {e}")))?;
    response
        .into_string()
        .map_err(|e| AppError::Storage(format!("calendar fetch failed: {e}")))
}

fn event_from_props(
    props: &HashMap<String, (HashMap<String, String>, String)>,
) -> Result<Option<IcsEvent>, AppError> {
    let uid = props
        .get("UID")
        .map(|(_, v)| v.trim().to_string())
        .filter(|s| !s.is_empty());
    let status = props
        .get("STATUS")
        .map(|(_, v)| v.as_str())
        .unwrap_or("CONFIRMED");
    let cancelled = status.eq_ignore_ascii_case("CANCELLED");

    if cancelled {
        return Ok(Some(IcsEvent {
            uid,
            summary: String::new(),
            description: None,
            start_at: Local::now(),
            end_at: Local::now(),
            all_day: false,
            recurrence: None,
            cancelled: true,
        }));
    }

    let (start_params, start_raw) = props
        .get("DTSTART")
        .ok_or_else(|| AppError::InvalidInput("event missing DTSTART".into()))?;
    let (start_at, all_day) = parse_ics_datetime(start_raw, start_params)?;

    let end_at = if let Some((end_params, end_raw)) = props.get("DTEND") {
        let (end, end_all_day) = parse_ics_datetime(end_raw, end_params)?;
        if all_day && end_all_day && end.date_naive() > start_at.date_naive() {
            end - Duration::days(1)
        } else {
            end
        }
    } else if let Some((_, duration)) = props.get("DURATION") {
        start_at + parse_duration(duration)?
    } else if all_day {
        start_at + Duration::days(1)
    } else {
        start_at + Duration::hours(1)
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

    let recurrence = props.get("RRULE").and_then(|(_, rule)| parse_rrule(rule));

    Ok(Some(IcsEvent {
        uid,
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

fn parse_duration(raw: &str) -> Result<Duration, AppError> {
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
    Ok(Duration::hours(hours) + Duration::minutes(minutes))
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

fn escape_ics_text(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            ';' => out.push_str("\\;"),
            ',' => out.push_str("\\,"),
            '\n' => out.push_str("\\n"),
            _ => out.push(ch),
        }
    }
    out
}

fn format_ics_utc(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

fn push_ics_line(out: &mut String, name: &str, value: &str) {
    let line = format!("{name}:{value}");
    let bytes = line.as_bytes();
    if bytes.len() <= 75 {
        out.push_str(&line);
        out.push_str("\r\n");
        return;
    }
    let mut start = 0;
    let mut first = true;
    while start < bytes.len() {
        let budget = if first { 75 } else { 74 };
        let mut end = (start + budget).min(bytes.len());
        while end > start && !line.is_char_boundary(end) {
            end -= 1;
        }
        if end == start {
            end = (start + 1).min(bytes.len());
        }
        if !first {
            out.push(' ');
        }
        out.push_str(&line[start..end]);
        out.push_str("\r\n");
        first = false;
        start = end;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:standup@google.com
DTSTART:20250903T140000Z
DTEND:20250903T150000Z
SUMMARY:Team standup
DESCRIPTION:Daily sync
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:holiday@google.com
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
UID:gone@google.com
DTSTART:20250901T090000
SUMMARY:Cancelled
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR"#;

    #[test]
    fn parses_google_like_ics() {
        let events = parse(SAMPLE).unwrap();
        assert_eq!(events.len(), 4);
        assert_eq!(events[0].summary, "Team standup");
        assert_eq!(events[0].uid.as_deref(), Some("standup@google.com"));
        assert_eq!(events[0].description.as_deref(), Some("Daily sync"));
        assert!(!events[0].all_day);
        assert!(events[1].all_day);
        assert_eq!(
            events[2].recurrence.as_ref().map(|r| r.frequency),
            Some(RecurrenceFrequency::Weekdays)
        );
        assert!(events[3].cancelled);
    }

    #[test]
    fn converts_to_calendar_block() {
        let events = parse(SAMPLE).unwrap();
        let block = to_block(&events[0]);
        assert_eq!(block.title, "Team standup");
        assert_eq!(block.external_uid.as_deref(), Some("standup@google.com"));
        assert_eq!(block.kind, BlockKind::Focus);
        assert_eq!(block.color_token, "focus");
    }

    #[test]
    fn merge_upserts_by_uid_and_skips_local_edits() {
        let events = parse(SAMPLE).unwrap();
        let seed: Vec<_> = events
            .iter()
            .filter(|e| e.uid.as_deref() == Some("standup@google.com"))
            .cloned()
            .collect();
        let mut blocks = vec![];
        let first = merge_events(&mut blocks, &seed);
        assert_eq!(first.imported, 1);
        assert_eq!(blocks.len(), 1);

        let mut again = seed.clone();
        again[0].summary = "Standup renamed".into();
        let second = merge_events(&mut blocks, &again);
        assert_eq!(second.updated, 1);
        assert_eq!(blocks[0].title, "Standup renamed");

        blocks[0].locally_edited = true;
        blocks[0].title = "My title".into();
        again[0].summary = "Google title".into();
        let third = merge_events(&mut blocks, &again);
        assert_eq!(third.skipped, 1);
        assert_eq!(blocks[0].title, "My title");
    }

    #[test]
    fn merge_removes_cancelled_synced_events() {
        let events = parse(SAMPLE).unwrap();
        let seed: Vec<_> = events
            .iter()
            .filter(|e| e.uid.as_deref() == Some("standup@google.com"))
            .cloned()
            .collect();
        let mut blocks = vec![];
        merge_events(&mut blocks, &seed);
        let cancelled = IcsEvent {
            uid: Some("standup@google.com".into()),
            summary: String::new(),
            description: None,
            start_at: Local::now(),
            end_at: Local::now(),
            all_day: false,
            recurrence: None,
            cancelled: true,
        };
        let result = merge_events(&mut blocks, &[cancelled]);
        assert_eq!(result.removed, 1);
        assert!(blocks.is_empty());
    }

    #[test]
    fn rejects_non_google_urls() {
        assert!(validate_gcal_url("http://calendar.google.com/x").is_err());
        assert!(validate_gcal_url("https://evil.example/calendar.ics").is_err());
        assert!(validate_gcal_url(
            "https://calendar.google.com/calendar/ical/user%40gmail.com/private-abc/basic.ics"
        )
        .is_ok());
    }

    #[test]
    fn export_round_trips_summary() {
        let events = parse(SAMPLE).unwrap();
        let block = to_block(&events[0]);
        let ics = export_ics(&[block]);
        let parsed = parse(&ics).unwrap();
        assert_eq!(parsed[0].summary, "Team standup");
        assert_eq!(parsed[0].uid.as_deref(), Some("standup@google.com"));
    }
}
