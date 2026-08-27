type Iso8601 = string;
type Uuid = string;

export type EisenhowerQuadrant =
  | "do_first"
  | "schedule"
  | "delegate"
  | "eliminate";

type TaskStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "done"
  | "archived";

type Priority = "critical" | "high" | "normal" | "low";

type TimerPhase =
  | "idle"
  | "focus"
  | "short_break"
  | "long_break"
  | "stopwatch";

type TimerRunState = "idle" | "running" | "paused" | "completed";

type Discontinuity = "none" | "system_suspend" | "clock_change";

export type BlockKind =
  | "focus"
  | "break"
  | "grounding"
  | "admin"
  | "milestone"
  | "buffer";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface BlockOutcome extends ActionResult {
  conflicts: CalendarTimeBlock[];
  block: CalendarTimeBlock | null;
}

export type BlockConflictChoice = "replace" | "move" | "keep-both" | "cancel";

/** Unresolved overlap returned from addBlock before the user picks a resolution. */
export interface PendingConflict {
  block: CalendarTimeBlock;
  conflicts: CalendarTimeBlock[];
}

/** Modal form state before conversion to a calendar block. */
export interface TimeBlockDraft {
  title: string;
  hour: number;
  minute: number;
  durationMinutes: number;
  kind: BlockKind;
}

interface ChecklistItem {
  id: Uuid;
  label: string;
  done: boolean;
}

export interface TaskItem {
  id: Uuid;
  parentId: Uuid | null;
  order: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  quadrant: EisenhowerQuadrant | null;
  tags: string[];
  estimateMinutes: number | null;
  actualMinutes: number;
  dueAt: Iso8601 | null;
  deferUntil: Iso8601 | null;
  linkedBlockIds: Uuid[];
  checklist: ChecklistItem[];
  createdAt: Iso8601;
  updatedAt: Iso8601;
  completedAt: Iso8601 | null;
}

interface EisenhowerQuadrantItem {
  id: Uuid;
  taskId: Uuid;
  quadrant: EisenhowerQuadrant;
  order: number;
  urgency: string;
  importance: string;
  delegateTo: string | null;
  eliminationReason: string | null;
  stagedForCalendar: boolean;
  enteredQuadrantAt: Iso8601;
}

interface QuadrantOrder {
  do_first: Uuid[];
  schedule: Uuid[];
  delegate: Uuid[];
  eliminate: Uuid[];
}

export interface EisenhowerMatrixFile {
  schemaVersion: number;
  items: EisenhowerQuadrantItem[];
  quadrantOrder: QuadrantOrder;
  archivedItemIds: Uuid[];
}

export interface CalendarTimeBlock {
  id: Uuid;
  title: string;
  taskId: Uuid | null;
  quadrantItemId: Uuid | null;
  startAt: Iso8601;
  endAt: Iso8601;
  allDay: boolean;
  kind: BlockKind;
  colorToken: string;
  notes: string | null;
  createdAt: Iso8601;
  updatedAt: Iso8601;
}

export interface DailyFocus {
  date: string;
  focusMs: number;
  metTarget: boolean;
}

export interface ConsistencyMetric {
  schemaVersion: number;
  dailyTargetMinutes: number;
  currentStreakDays: number;
  longestStreakDays: number;
  streakAnchorDate: string | null;
  todayFocusMs: number;
  todayCompletionPercent: number;
  lastRecalculatedAt: Iso8601;
}

export interface AppConfig {
  schemaVersion: number;
  pomodoroFocusMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroCycleLength: number;
  hudAutoShowOnSessionStart: boolean;
  coloredTimeBlocks: boolean;
  promptTaskOnBlockCreate?: boolean;
  activeWidgets: string[];
}

export interface WidgetLayout {
  schemaVersion: number;
  widgetIds: WidgetId[];
}

export function parseWidgetIds(ids: string[]): WidgetId[] {
  const valid = new Set<string>(WIDGET_CATALOG.map((w) => w.id));
  return ids.filter((id): id is WidgetId => valid.has(id));
}

export interface TimerTickPayload {
  sessionId: Uuid;
  phase: TimerPhase;
  runState: TimerRunState;
  anchorAt: Iso8601;
  elapsedMs: number;
  remainingMs: number | null;
  phaseDurationMs: number | null;
  phaseIndex: number;
  cycleLength: number;
  discontinuity: Discontinuity;
}

export type MainTab = "widgets" | "schedule" | "matrix";

export type WidgetId =
  | "focus"
  | "clock"
  | "tasks"
  | "heatmap"
  | "target"
  | "cheatsheet"
  | "breathing"
  | "vent";

export const WIDGET_CATALOG: { id: WidgetId; label: string; description: string }[] = [
  { id: "focus", label: "Focus Timer", description: "Pomodoro and stopwatch" },
  { id: "clock", label: "Current Time", description: "Live clock display" },
  { id: "tasks", label: "Task List", description: "Quick task overview" },
  { id: "heatmap", label: "Activity Heatmap", description: "Focus consistency grid" },
  { id: "target", label: "Daily Target", description: "Focus progress ring" },
  { id: "cheatsheet", label: "Commands", description: "Command bar reference" },
  { id: "breathing", label: "Breathe", description: "Box and 4-7-8 guide" },
  { id: "vent", label: "Venting Corner", description: "Ephemeral, never saved" },
];

export const QUADRANT_META: Record<
  EisenhowerQuadrant,
  { title: string; subtitle: string }
> = {
  do_first: { title: "Do First", subtitle: "Urgent & Important" },
  schedule: { title: "Schedule", subtitle: "Not Urgent & Important" },
  delegate: { title: "Delegate", subtitle: "Urgent & Not Important" },
  eliminate: { title: "Eliminate", subtitle: "Not Urgent & Not Important" },
};
