import type { BlockKind, CalendarTimeBlock } from "@/types";

export const SCHEDULE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

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

export function blockTimesFromHour(
  hour: number,
  durationMinutes: number,
  date = new Date(),
): { startAt: string; endAt: string } {
  const start = new Date(date);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function createTimeBlock(input: {
  title: string;
  hour: number;
  durationMinutes: number;
  kind: BlockKind;
  colorToken: string;
}): CalendarTimeBlock {
  const now = new Date().toISOString();
  const { startAt, endAt } = blockTimesFromHour(input.hour, input.durationMinutes);
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

export function blockLayout(
  block: CalendarTimeBlock,
  startHour: number,
  endHour: number,
): { top: number; height: number } {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  const rangeMinutes = (endHour - startHour) * 60;
  const top =
    ((start.getHours() * 60 + start.getMinutes() - startHour * 60) / rangeMinutes) * 100;
  const height = ((end.getTime() - start.getTime()) / 60_000 / rangeMinutes) * 100;
  return { top, height: Math.max(height, 4) };
}
