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
