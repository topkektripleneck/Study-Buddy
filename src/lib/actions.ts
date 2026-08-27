import { api } from "@/lib/api";
import {
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
  ActionResult,
  BlockConflictChoice,
  BlockKind,
  BlockOutcome,
  CalendarTimeBlock,
  EisenhowerQuadrant,
  MainTab,
  TaskItem,
} from "@/types";

export type { ActionResult, BlockConflictChoice, BlockOutcome } from "@/types";

export interface BlockDraft {
  title: string;
  start: ClockTime;
  end: ClockTime;
  kind: BlockKind;
}

const NAVIGATE_EVENT = "sb:navigate";

function ipcFailure(error: unknown): ActionResult {
  return {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function ipc(build: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await build();
  } catch (error) {
    return ipcFailure(error);
  }
}

async function ipcBlock(build: () => Promise<BlockOutcome>): Promise<BlockOutcome> {
  try {
    return await build();
  } catch (error) {
    return { ...ipcFailure(error), conflicts: [], block: null };
  }
}

export function navigateTo(tab: MainTab): ActionResult {
  window.dispatchEvent(new CustomEvent<MainTab>(NAVIGATE_EVENT, { detail: tab }));
  return { ok: true, message: `Opened ${tab}` };
}

function isMainTab(value: unknown): value is MainTab {
  return value === "widgets" || value === "schedule" || value === "matrix";
}

export function onNavigate(handler: (tab: MainTab) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && isMainTab(event.detail)) handler(event.detail);
  };
  window.addEventListener(NAVIGATE_EVENT, listener);
  return () => window.removeEventListener(NAVIGATE_EVENT, listener);
}

export async function startFocus(minutes?: number): Promise<ActionResult> {
  if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 1 || minutes > 240)) {
    return { ok: false, message: "Duration must be between 1 and 240 minutes" };
  }
  return ipc(async () => {
    await api.timerStart("pomodoro", minutes);
    const config = await api.configGet();
    if (config.hudAutoShowOnSessionStart) {
      await openWindow("hud");
    }
    return { ok: true, message: `Started ${minutes ?? config.pomodoroFocusMinutes}m focus` };
  });
}

export async function startStopwatch(): Promise<ActionResult> {
  return ipc(async () => {
    await api.timerStart("stopwatch");
    return { ok: true, message: "Stopwatch running" };
  });
}

export async function pauseTimer(): Promise<ActionResult> {
  return ipc(async () => {
    await api.timerPause();
    return { ok: true, message: "Paused" };
  });
}

export async function resumeTimer(): Promise<ActionResult> {
  return ipc(async () => {
    await api.timerResume();
    return { ok: true, message: "Resumed" };
  });
}

export async function resetTimer(): Promise<ActionResult> {
  return ipc(async () => {
    await api.timerReset();
    return { ok: true, message: "Timer reset" };
  });
}

export async function skipPhase(): Promise<ActionResult> {
  return ipc(async () => {
    await api.timerSkipPhase();
    return { ok: true, message: "Skipped to next phase" };
  });
}

export async function createTask(title: string): Promise<ActionResult> {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, message: "Task needs a title" };
  return ipc(async () => {
    await api.taskCreate(trimmed);
    return { ok: true, message: `Added "${trimmed}"` };
  });
}

export async function toggleTaskDone(taskId: string): Promise<ActionResult> {
  return ipc(async () => {
    const task = await api.taskToggleDone(taskId);
    return {
      ok: true,
      message: task.status === "done" ? `Completed "${task.title}"` : `Reopened "${task.title}"`,
    };
  });
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  return ipc(async () => {
    await api.taskDelete(taskId);
    return { ok: true, message: "Task deleted" };
  });
}

export async function setQuadrant(
  taskId: string,
  quadrant: EisenhowerQuadrant,
): Promise<ActionResult> {
  return ipc(async () => {
    await api.matrixSetQuadrant(taskId, quadrant);
    return { ok: true, message: `Moved to ${quadrant.replace("_", " ")}` };
  });
}

export async function removeFromMatrix(itemId: string): Promise<ActionResult> {
  return ipc(async () => {
    await api.matrixRemoveItem(itemId);
    return { ok: true, message: "Removed from matrix" };
  });
}

/**
 * Creates a block unless it overlaps an existing one. When it does, nothing is
 * written and the conflicts are returned so the caller can decide what to do.
 */
export async function addBlock(draft: BlockDraft): Promise<BlockOutcome> {
  const durationMinutes = minutesBetween(draft.start, draft.end);
  if (durationMinutes <= 0) {
    return { ok: false, message: "End time must be after start time", conflicts: [], block: null };
  }

  const block = createTimeBlock({
    title: draft.title,
    hour: draft.start.hour,
    minute: draft.start.minute,
    durationMinutes,
    kind: draft.kind,
  });

  return ipcBlock(async () => {
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

    const saved = await api.calendarSaveBlock(block);
    const label = `${formatClockLabel(draft.start.hour, draft.start.minute)}–${formatClockLabel(
      draft.end.hour,
      draft.end.minute,
    )}`;
    return { ok: true, message: `Added "${saved.title}" ${label}`, conflicts: [], block: saved };
  });
}

async function replaceBlocks(
  conflicts: CalendarTimeBlock[],
  block: CalendarTimeBlock,
): Promise<ActionResult> {
  return ipc(async () => {
    for (const conflict of conflicts) {
      await api.calendarDeleteBlock(conflict.id);
    }
    const saved = await api.calendarSaveBlock(block);
    return { ok: true, message: `Replaced ${conflicts.length} block(s) with "${saved.title}"` };
  });
}

/** One resolver for schedule UI and command bar. */
export async function resolveBlockConflict(
  choice: BlockConflictChoice,
  block: CalendarTimeBlock,
  conflicts: CalendarTimeBlock[],
): Promise<ActionResult | null> {
  if (choice === "cancel") return null;
  if (choice === "replace") return replaceBlocks(conflicts, block);
  if (choice === "move") return moveBlockAfterConflicts(block, conflicts);
  return ipc(async () => {
    const saved = await api.calendarSaveBlock(block);
    return { ok: true, message: `Added "${saved.title}"` };
  });
}

/** Shifts a rejected block to start when the last conflicting block ends. */
async function moveBlockAfterConflicts(
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

  return ipc(async () => {
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
  });
}

export async function deleteBlock(blockId: string): Promise<ActionResult> {
  return ipc(async () => {
    await api.calendarDeleteBlock(blockId);
    return { ok: true, message: "Block removed" };
  });
}

export async function removeBlockAt(time: ClockTime): Promise<ActionResult> {
  return ipc(async () => {
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
  });
}

export async function linkBlockToTask(block: CalendarTimeBlock): Promise<ActionResult> {
  return ipc(async () => {
    const task = await api.taskCreate(block.title);
    const linkedTask: TaskItem = {
      ...task,
      linkedBlockIds: [...task.linkedBlockIds, block.id],
      estimateMinutes: Math.round(
        (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000,
      ),
    };
    await api.taskUpdate(linkedTask);
    await api.calendarSaveBlock({
      ...block,
      taskId: task.id,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, message: `Linked task "${task.title}"` };
  });
}

export async function setHud(visible: boolean): Promise<ActionResult> {
  return ipc(async () => {
    if (visible) {
      await openWindow("hud");
    } else {
      await closeWindow("hud");
    }
    return { ok: true, message: visible ? "HUD shown" : "HUD hidden" };
  });
}

export async function toggleHud(): Promise<ActionResult> {
  return ipc(async () => {
    const open = await toggleWindow("hud");
    return { ok: true, message: open ? "HUD shown" : "HUD hidden" };
  });
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
