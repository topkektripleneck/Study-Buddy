import type { BlockKind, CalendarTimeBlock } from "@/types";

export const SCHEDULE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/** Pixel height of one hour row. All timeline geometry is derived from this. */
export const HOUR_ROW_HEIGHT = 48;

export const BLOCK_KINDS: { value: BlockKind; label: string; color: string }[] = [
  { value: "focus", label: "Focus", color: "accent" },
  { value: "break", label: "Break", color: "success" },
  { value: "grounding", label: "Grounding", color: "warm" },
  { value: "admin", label: "Admin", color: "admin" },
  { value: "milestone", label: "Milestone", color: "accent" },
  { value: "buffer", label: "Buffer", color: "warm" },
];

export function formatHourLabel(hour: number): string {
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${h} ${suffix}`;
}

export function formatClockLabel(hour: number, minute: number): string {
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${h}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function blockTimes(
  hour: number,
  minute: number,
  durationMinutes: number,
  date = new Date(),
): { startAt: string; endAt: string } {
  const start = new Date(date);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function createTimeBlock(input: {
  title: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  kind: BlockKind;
  colorToken: string;
}): CalendarTimeBlock {
  const now = new Date().toISOString();
  const { startAt, endAt } = blockTimes(input.hour, input.minute, input.durationMinutes);
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    taskId: null,
    quadrantItemId: null,
    startAt,
    endAt,
    allDay: false,
    kind: input.kind,
    colorToken: input.colorToken,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isSameLocalDay(iso: string, date = new Date()): boolean {
  return new Date(iso).toDateString() === date.toDateString();
}

export interface ClockTime {
  hour: number;
  minute: number;
}

/**
 * Parses a loose time token: "13:30", "1:30pm", "1pm", "9", "0930".
 * Bare numbers below 8 are read as afternoon, matching how people say "meet at 2".
 */
export function parseTimeToken(raw: string): ClockTime | null {
  const token = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!token) return null;

  const match = token.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];

  if (minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!suffix && hour < 8) hour += 12;
  if (hour > 23) return null;

  return { hour, minute };
}

/** Parses "1:30-2:30pm" into two clock times. A pm/am suffix carries backwards. */
export function parseTimeRange(raw: string): { start: ClockTime; end: ClockTime } | null {
  const [left, right] = raw.split(/[-–—]|to/).map((part) => part?.trim());
  if (!left || !right) return null;

  const end = parseTimeToken(right);
  if (!end) return null;

  const suffix = right.trim().toLowerCase().match(/(am|pm)$/)?.[1];
  const hasOwnSuffix = /(am|pm)$/i.test(left.trim());
  const start = parseTimeToken(suffix && !hasOwnSuffix ? `${left}${suffix}` : left);
  if (!start) return null;

  return { start, end };
}

export function endTimeFrom(start: ClockTime, durationMinutes: number): ClockTime {
  const total = Math.min(start.hour * 60 + start.minute + durationMinutes, 24 * 60 - 1);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export function minutesBetween(start: ClockTime, end: ClockTime): number {
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  return endMinutes - startMinutes;
}

/** Blocks whose time range overlaps [startAt, endAt). Touching edges do not count. */
export function findConflicts(
  blocks: CalendarTimeBlock[],
  startAt: string,
  endAt: string,
  excludeId?: string,
): CalendarTimeBlock[] {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  return blocks.filter((block) => {
    if (block.id === excludeId) return false;
    const blockStart = new Date(block.startAt).getTime();
    const blockEnd = new Date(block.endAt).getTime();
    return blockStart < end && blockEnd > start;
  });
}

/** The block covering a given wall-clock time today, if any. */
export function blockAt(
  blocks: CalendarTimeBlock[],
  time: ClockTime,
  date = new Date(),
): CalendarTimeBlock | null {
  const target = new Date(date);
  target.setHours(time.hour, time.minute, 0, 0);
  const stamp = target.getTime();

  return (
    blocks.find((block) => {
      const start = new Date(block.startAt).getTime();
      const end = new Date(block.endAt).getTime();
      return stamp >= start && stamp < end;
    }) ?? null
  );
}

/** Vertical offset in pixels for an hour gridline, measured from the top of the timeline. */
export function hourOffsetPx(hour: number, startHour: number): number {
  return (hour - startHour) * HOUR_ROW_HEIGHT;
}

/** Vertical offset in pixels for a wall-clock time. */
export function timeOffsetPx(date: Date, startHour: number): number {
  const minutesFromStart = date.getHours() * 60 + date.getMinutes() - startHour * 60;
  return (minutesFromStart / 60) * HOUR_ROW_HEIGHT;
}

export function timelineHeightPx(startHour: number, endHour: number): number {
  return (endHour - startHour) * HOUR_ROW_HEIGHT;
}

export function blockLayoutPx(
  block: CalendarTimeBlock,
  startHour: number,
): { top: number; height: number } {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  return {
    top: timeOffsetPx(start, startHour),
    height: Math.max((durationMinutes / 60) * HOUR_ROW_HEIGHT, 18),
  };
}
