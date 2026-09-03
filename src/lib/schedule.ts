import type {
  BlockKind,
  CalendarTimeBlock,
  TaskItem,
  TimeBlockDraft,
} from "@/types";

export const SCHEDULE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/** Pixel height of one hour row. All timeline geometry is derived from this. */
export const HOUR_ROW_HEIGHT = 48;

export const BLOCK_KINDS: { value: BlockKind; label: string; color: BlockKind }[] = [
  { value: "focus", label: "Focus", color: "focus" },
  { value: "break", label: "Break", color: "break" },
  { value: "grounding", label: "Grounding", color: "grounding" },
  { value: "admin", label: "Admin", color: "admin" },
  { value: "milestone", label: "Milestone", color: "milestone" },
  { value: "buffer", label: "Buffer", color: "buffer" },
];

function hour12(hour: number): { h: number; suffix: "am" | "pm" } {
  return {
    h: hour > 12 ? hour - 12 : hour === 0 ? 12 : hour,
    suffix: hour >= 12 ? "pm" : "am",
  };
}

export function formatHourLabel(hour: number): string {
  const { h, suffix } = hour12(hour);
  return `${h} ${suffix}`;
}

export function formatClockLabel(hour: number, minute: number): string {
  const { h, suffix } = hour12(hour);
  return `${h}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function blockTimes(
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

export function createTimeBlock(input: TimeBlockDraft): CalendarTimeBlock {
  const now = new Date().toISOString();
  const { startAt, endAt } = blockTimes(
    input.hour,
    input.minute,
    input.durationMinutes,
    input.localDate,
  );
  const colorToken = BLOCK_KINDS.find((k) => k.value === input.kind)?.color ?? "focus";
  return {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    taskId: null,
    quadrantItemId: null,
    startAt,
    endAt,
    allDay: false,
    kind: input.kind,
    colorToken,
    notes: null,
    recurrence: input.recurrence ?? null,
    seriesId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateTimeBlock(block: CalendarTimeBlock, input: TimeBlockDraft): CalendarTimeBlock {
  const { startAt, endAt } = blockTimes(
    input.hour,
    input.minute,
    input.durationMinutes,
    input.localDate,
  );
  const colorToken = BLOCK_KINDS.find((k) => k.value === input.kind)?.color ?? block.colorToken;
  return {
    ...block,
    title: input.title.trim(),
    startAt,
    endAt,
    kind: input.kind,
    colorToken,
    recurrence: input.recurrence ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/** Tasks linked to a block via taskId or linkedBlockIds. */
export function tasksForBlock(block: CalendarTimeBlock, tasks: TaskItem[]): TaskItem[] {
  return tasks.filter(
    (t) => t.id === block.taskId || t.linkedBlockIds.includes(block.id),
  );
}

export function isSameLocalDay(iso: string, date = new Date()): boolean {
  return new Date(iso).toDateString() === date.toDateString();
}

/** Monday-start week containing `base`. */
export function localWeekDates(base = new Date()): Date[] {
  const day = base.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(base);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function shiftBlockByMinutes(
  block: CalendarTimeBlock,
  deltaMinutes: number,
): CalendarTimeBlock {
  const deltaMs = deltaMinutes * 60_000;
  return {
    ...block,
    startAt: new Date(new Date(block.startAt).getTime() + deltaMs).toISOString(),
    endAt: new Date(new Date(block.endAt).getTime() + deltaMs).toISOString(),
    updatedAt: new Date().toISOString(),
  };
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

export function hourOffsetPx(hour: number, startHour: number): number {
  return (hour - startHour) * HOUR_ROW_HEIGHT;
}

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

export interface BlockOverlapLayout {
  top: number;
  height: number;
  column: number;
  columns: number;
  widthPct: number;
  leftPct: number;
}

/** Side-by-side columns for overlapping blocks on the same day. */
export function overlapLayouts(
  blocks: CalendarTimeBlock[],
  startHour: number,
): Map<string, BlockOverlapLayout> {
  const sorted = [...blocks].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const placements: { block: CalendarTimeBlock; col: number }[] = [];
  const columnEnds: number[] = [];

  for (const block of sorted) {
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    let col = columnEnds.findIndex((colEnd) => start >= colEnd);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = Math.max(columnEnds[col], end);
    }
    placements.push({ block, col });
  }

  const map = new Map<string, BlockOverlapLayout>();
  for (const { block, col } of placements) {
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    const overlapping = placements.filter(({ block: b }) => {
      const bs = new Date(b.startAt).getTime();
      const be = new Date(b.endAt).getTime();
      return bs < end && be > start;
    });
    const columns = Math.max(...overlapping.map((p) => p.col), 0) + 1;
    const layout = blockLayoutPx(block, startHour);
    map.set(block.id, {
      ...layout,
      column: col,
      columns,
      widthPct: 100 / columns,
      leftPct: (col / columns) * 100,
    });
  }
  return map;
}

export function resizeBlockEnd(
  block: CalendarTimeBlock,
  deltaMinutes: number,
  minMinutes = 15,
): CalendarTimeBlock {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  const duration = Math.max(minMinutes, (end.getTime() - start.getTime()) / 60_000 + deltaMinutes);
  const newEnd = new Date(start.getTime() + duration * 60_000);
  return { ...block, endAt: newEnd.toISOString() };
}
