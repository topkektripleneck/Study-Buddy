import { api } from "@/lib/api";
import {
  BLOCK_KINDS,
  blockAt,
  createTimeBlock,
  findConflicts,
  formatClockLabel,
  isSameLocalDay,
  minutesBetween,
  type ClockTime,
} from "@/lib/schedule";
import { toggleWindow, openWindow, closeWindow } from "@/lib/windows";
import type {
  BlockKind,
  CalendarTimeBlock,
  EisenhowerQuadrant,
  MainTab,
  TaskItem,
} from "@/types";

/**
 * Domain operations shared by the UI, the command bar, and the tray. Anything
 * that changes state should live here so the entry points cannot drift apart.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface BlockDraft {
  title: string;
  start: ClockTime;
  end: ClockTime;
  kind: BlockKind;
}

export interface BlockOutcome extends ActionResult {
  conflicts: CalendarTimeBlock[];
  block: CalendarTimeBlock | null;
}

const NAVIGATE_EVENT = "sb:navigate";

export function navigateTo(tab: MainTab): ActionResult {
  window.dispatchEvent(new CustomEvent<MainTab>(NAVIGATE_EVENT, { detail: tab }));
  return { ok: true, message: `Opened ${tab}` };
}

export function onNavigate(handler: (tab: MainTab) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<MainTab>).detail);
  window.addEventListener(NAVIGATE_EVENT, listener);
  return () => window.removeEventListener(NAVIGATE_EVENT, listener);
}

export async function startFocus(minutes?: number): Promise<ActionResult> {
  if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 1 || minutes > 240)) {
    return { ok: false, message: "Duration must be between 1 and 240 minutes" };
  }
  await api.timerStart("pomodoro", minutes);
  const config = await api.configGet();
  if (config.hudAutoShowOnSessionStart) {
    await openWindow("hud");
  }
  return { ok: true, message: `Started ${minutes ?? config.pomodoroFocusMinutes}m focus` };
}

export async function startStopwatch(): Promise<ActionResult> {
  await api.timerStart("stopwatch");
  return { ok: true, message: "Stopwatch running" };
}

export async function pauseTimer(): Promise<ActionResult> {
  await api.timerPause();
  return { ok: true, message: "Paused" };
}

export async function resumeTimer(): Promise<ActionResult> {
  await api.timerResume();
  return { ok: true, message: "Resumed" };
}

export async function resetTimer(): Promise<ActionResult> {
  await api.timerReset();
  return { ok: true, message: "Timer reset" };
}

export async function skipPhase(): Promise<ActionResult> {
  await api.timerSkipPhase();
  return { ok: true, message: "Skipped to next phase" };
}

export async function createTask(title: string): Promise<ActionResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, message: "Task needs a title" };
  await api.taskCreate(trimmed);
  return { ok: true, message: `Added "${trimmed}"` };
}

export async function toggleTaskDone(taskId: string): Promise<ActionResult> {
  const task = await api.taskToggleDone(taskId);
  return {
    ok: true,
    message: task.status === "done" ? `Completed "${task.title}"` : `Reopened "${task.title}"`,
  };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  await api.taskDelete(taskId);
  return { ok: true, message: "Task deleted" };
}

export async function setQuadrant(
  taskId: string,
  quadrant: EisenhowerQuadrant,
): Promise<ActionResult> {
  await api.matrixSetQuadrant(taskId, quadrant);
  return { ok: true, message: `Moved to ${quadrant.replace("_", " ")}` };
}

export async function removeFromMatrix(itemId: string): Promise<ActionResult> {
  await api.matrixRemoveItem(itemId);
  return { ok: true, message: "Removed from matrix" };
}

/**
 * Creates a block unless it overlaps an existing one. When it does, nothing is
 * written and the conflicts are returned so the caller can decide what to do.
 */
export async function addBlock(draft: BlockDraft, force = false): Promise<BlockOutcome> {
  const durationMinutes = minutesBetween(draft.start, draft.end);
  if (durationMinutes <= 0) {
    return { ok: false, message: "End time must be after start time", conflicts: [], block: null };
  }

  const colorToken = BLOCK_KINDS.find((k) => k.value === draft.kind)?.color ?? "accent";
  const block = createTimeBlock({
    title: draft.title,
    hour: draft.start.hour,
    minute: draft.start.minute,
    durationMinutes,
    kind: draft.kind,
    colorToken,
  });

  if (!force) {
    const existing = await api.calendarList();
    const conflicts = findConflicts(existing, block.startAt, block.endAt);
    if (conflicts.length > 0) {
      return {
        ok: false,
        message: `Conflicts with ${conflicts.map((c) => c.title).join(", ")}`,
        conflicts,
        block,
      };
    }
  }

  const saved = await api.calendarSaveBlock(block);
  const label = `${formatClockLabel(draft.start.hour, draft.start.minute)}–${formatClockLabel(
    draft.end.hour,
    draft.end.minute,
  )}`;
  return { ok: true, message: `Added "${saved.title}" ${label}`, conflicts: [], block: saved };
}

export async function replaceBlocks(
  conflicts: CalendarTimeBlock[],
  block: CalendarTimeBlock,
): Promise<ActionResult> {
  for (const conflict of conflicts) {
    await api.calendarDeleteBlock(conflict.id);
  }
  const saved = await api.calendarSaveBlock(block);
  return { ok: true, message: `Replaced ${conflicts.length} block(s) with "${saved.title}"` };
}

/** Shifts a rejected block to start when the last conflicting block ends. */
export async function moveBlockAfterConflicts(
  block: CalendarTimeBlock,
  conflicts: CalendarTimeBlock[],
): Promise<ActionResult> {
  const latestEnd = Math.max(...conflicts.map((c) => new Date(c.endAt).getTime()));
  const durationMs = new Date(block.endAt).getTime() - new Date(block.startAt).getTime();
  const moved: CalendarTimeBlock = {
    ...block,
    startAt: new Date(latestEnd).toISOString(),
    endAt: new Date(latestEnd + durationMs).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const stillClashing = findConflicts(await api.calendarList(), moved.startAt, moved.endAt);
  if (stillClashing.length > 0) {
    return { ok: false, message: "Still overlaps something after moving" };
  }

  const saved = await api.calendarSaveBlock(moved);
  const start = new Date(saved.startAt);
  return {
    ok: true,
    message: `Moved "${saved.title}" to ${formatClockLabel(start.getHours(), start.getMinutes())}`,
  };
}

export async function deleteBlock(blockId: string): Promise<ActionResult> {
  await api.calendarDeleteBlock(blockId);
  return { ok: true, message: "Block removed" };
}

export async function removeBlockAt(time: ClockTime): Promise<ActionResult> {
  const blocks = (await api.calendarList()).filter((b) => isSameLocalDay(b.startAt));
  const found = blockAt(blocks, time);
  if (!found) {
    return {
      ok: false,
      message: `No block at ${formatClockLabel(time.hour, time.minute)}`,
    };
  }
  await api.calendarDeleteBlock(found.id);
  return { ok: true, message: `Removed "${found.title}"` };
}

export async function setHud(visible: boolean): Promise<ActionResult> {
  if (visible) {
    await openWindow("hud");
  } else {
    await closeWindow("hud");
  }
  return { ok: true, message: visible ? "HUD shown" : "HUD hidden" };
}

export async function toggleHud(): Promise<ActionResult> {
  const open = await toggleWindow("hud");
  return { ok: true, message: open ? "HUD shown" : "HUD hidden" };
}

/** Loose title match used by commands that address a task by name. */
export function findTaskByQuery(tasks: TaskItem[], query: string): TaskItem | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "archived");
  const pools = [open, tasks];

  for (const pool of pools) {
    const exact = pool.find((t) => t.title.toLowerCase() === needle);
    if (exact) return exact;
    const partial = pool.find((t) => t.title.toLowerCase().includes(needle));
    if (partial) return partial;
  }
  return null;
}
