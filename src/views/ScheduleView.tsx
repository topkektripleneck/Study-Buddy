import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddTimeBlockModal } from "@/components/AddTimeBlockModal";
import { LinkBlockTaskModal } from "@/components/LinkBlockTaskModal";
import { TaskPromptModal } from "@/components/TaskPromptModal";
import { useListen } from "@/hooks/useListen";
import { useNow } from "@/hooks/useNow";
import { addBlock, deleteBlock, linkBlockToTask, linkTaskToBlock, resolveBlockConflict } from "@/lib/actions";
import { api } from "@/lib/api";
import { safeListen } from "@/lib/safeListen";
import {
  HOUR_ROW_HEIGHT,
  SCHEDULE_HOURS,
  endTimeFrom,
  formatClockLabel,
  formatHourLabel,
  hourOffsetPx,
  isSameLocalDay,
  localWeekDates,
  overlapLayouts,
  resizeBlockEnd,
  shiftBlockByMinutes,
  tasksForBlock,
  timeOffsetPx,
  timelineHeightPx,
  updateTimeBlock,
} from "@/lib/schedule";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { AppConfig, CalendarTimeBlock, PendingConflict, TaskItem, TimeBlockDraft } from "@/types";

import { resolveBlockColor } from "@/lib/constellations";

interface SlotTarget {
  hour: number;
  minute: number;
}

type CalendarViewMode = "day" | "week";

interface StagedItem {
  taskId: string;
  title: string;
}

export function ScheduleView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [blocks, setBlocks] = useState<CalendarTimeBlock[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [selectedWeekDay, setSelectedWeekDay] = useState(() => new Date());
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [slot, setSlot] = useState<SlotTarget | null>(null);
  const [editBlock, setEditBlock] = useState<CalendarTimeBlock | null>(null);
  const [pendingTaskBlock, setPendingTaskBlock] = useState<CalendarTimeBlock | null>(null);
  const [linkTaskBlock, setLinkTaskBlock] = useState<CalendarTimeBlock | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startY: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeDelta, setResizeDelta] = useState(0);

  const now = useNow(15_000);
  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1;
  const timelineHeight = timelineHeightPx(startHour, endHour);
  const nowTop = timeOffsetPx(now, startHour);

  const refresh = useCallback(async () => {
    try {
      const [t, b, c] = await Promise.all([
        api.tasksList(),
        api.calendarList(),
        api.configGet(),
      ]);
      setTasks(t);
      setBlocks(b);
      setConfig(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useListen(refresh, "calendar:changed", "tasks:changed", "config:changed");

  useEffect(() => {
    return safeListen<{ taskId: string; title: string }>("matrix:staged-for-calendar", (event) => {
      setStaged((prev) => [
        ...prev,
        { taskId: event.payload.taskId, title: event.payload.title },
      ]);
    });
  }, []);

  const weekDays = useMemo(() => localWeekDates(now), [now]);

  const timelineDay = viewMode === "day" ? now : selectedWeekDay;

  const timelineBlocks = useMemo(
    () =>
      blocks
        .filter((b) => isSameLocalDay(b.startAt, timelineDay))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [blocks, timelineDay],
  );

  const overlapMap = useMemo(
    () => overlapLayouts(timelineBlocks, startHour),
    [timelineBlocks, startHour],
  );

  const showingToday = timelineDay.toDateString() === now.toDateString();
  const nowLineVisible = showingToday && nowTop >= 0 && nowTop <= timelineHeight;

  /** Converts a click inside an hour row into an hour + quarter-hour target. */
  function slotFromClick(hour: number, event: React.MouseEvent<HTMLButtonElement>): SlotTarget {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top) / bounds.height;
    const minute = Math.min(45, Math.max(0, Math.round((ratio * 60) / 15) * 15));
    return { hour, minute };
  }

  function afterBlockSaved(saved: CalendarTimeBlock, taskHandled = false) {
    setSlot(null);
    setConflict(null);
    refresh();
    if (!taskHandled && (config?.promptTaskOnBlockCreate ?? true)) {
      setPendingTaskBlock(saved);
    }
  }

  async function applyTaskLink(block: CalendarTimeBlock, taskLink: TimeBlockDraft["taskLink"]) {
    if (!taskLink || taskLink === "none") return false;
    if (taskLink === "new") {
      const result = await linkBlockToTask(block);
      if (!result.ok) setError(result.message);
      return result.ok;
    }
    const result = await linkTaskToBlock(block, taskLink);
    if (!result.ok) setError(result.message);
    return result.ok;
  }

  async function saveBlock(draft: TimeBlockDraft) {
    if (editBlock) {
      const updated = updateTimeBlock(editBlock, { ...draft, localDate: draft.localDate ?? timelineDay });
      try {
        await api.calendarSaveBlock(updated);
        setEditBlock(null);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update block");
      }
      return;
    }

    const start = { hour: draft.hour, minute: draft.minute };
    const outcome = await addBlock({
      title: draft.title,
      kind: draft.kind,
      start,
      end: endTimeFrom(start, draft.durationMinutes),
      localDate: draft.localDate ?? timelineDay,
      recurrence: draft.recurrence,
    });

    if (outcome.block && outcome.conflicts.length > 0) {
      setConflict({ block: outcome.block, conflicts: outcome.conflicts });
      return;
    }
    if (!outcome.ok || !outcome.block) {
      setError(outcome.message);
      return;
    }
    const taskHandled = await applyTaskLink(outcome.block, draft.taskLink);
    afterBlockSaved(outcome.block, taskHandled);
  }

  async function resolveConflict(choice: "replace" | "keep-both" | "cancel") {
    if (!conflict) return;
    const { block, conflicts } = conflict;
    const outcome = await resolveBlockConflict(choice, block, conflicts);
    if (!outcome) {
      setConflict(null);
      return;
    }
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    afterBlockSaved(block);
  }

  async function handleTaskPrompt(createTask: boolean) {
    if (!pendingTaskBlock) return;
    const block = pendingTaskBlock;
    setPendingTaskBlock(null);

    if (!createTask) return;

    const result = await linkBlockToTask(block);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refresh();
  }

  async function removeBlock(blockId: string) {
    const result = await deleteBlock(blockId);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }

  async function moveBlock(blockId: string, deltaPx: number) {
    const deltaMinutes = Math.round((deltaPx / HOUR_ROW_HEIGHT) * 60 / 15) * 15;
    if (deltaMinutes === 0) return;
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const updated = shiftBlockByMinutes(block, deltaMinutes);
    try {
      await api.calendarSaveBlock(updated);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move block");
    }
  }

  function onBlockResizeStart(blockId: string, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    resizeRef.current = { id: blockId, startY: event.clientY };
    setResizingId(blockId);
    setResizeDelta(0);

    function onMove(e: PointerEvent) {
      if (!resizeRef.current) return;
      setResizeDelta(e.clientY - resizeRef.current.startY);
    }

    function onUp(e: PointerEvent) {
      if (!resizeRef.current) return;
      const { id, startY } = resizeRef.current;
      const deltaPx = e.clientY - startY;
      resizeRef.current = null;
      setResizingId(null);
      setResizeDelta(0);
      if (Math.abs(deltaPx) < 4) return;
      const deltaMinutes = Math.round((deltaPx / HOUR_ROW_HEIGHT) * 60 / 15) * 15;
      if (deltaMinutes === 0) return;
      void resizeBlockByDelta(id, deltaMinutes);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }

  async function resizeBlockByDelta(blockId: string, deltaMinutes: number) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const updated = resizeBlockEnd(block, deltaMinutes);
    try {
      await api.calendarSaveBlock(updated);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resize block");
    }
  }

  function onBlockDragStart(blockId: string, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { id: blockId, startY: event.clientY };
    setDraggingId(blockId);
    setDragOffset(0);

    function onMove(e: PointerEvent) {
      if (!dragRef.current) return;
      setDragOffset(e.clientY - dragRef.current.startY);
    }

    function onUp(e: PointerEvent) {
      if (!dragRef.current) return;
      const { id, startY } = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      const delta = e.clientY - startY;
      setDragOffset(0);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void moveBlock(id, delta);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div>
      {error && (
        <p className="sb-error-banner" role="alert">
          {error}
        </p>
      )}

      <div style={layout}>
        <aside style={sidebar}>
          {staged.length > 0 && (
            <div style={stagingRail}>
              <strong style={stagingTitle}>Staging</strong>
              <ul style={taskList}>
                {staged.map((item) => (
                  <li key={item.taskId} style={blockItem}>
                    {item.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={sidebarHeader}>
            <h3 style={heading}>Tasks</h3>
            <span style={count}>{timelineBlocks.length} blocks</span>
          </div>
          <ul style={taskList}>
            {timelineBlocks.length === 0 ? (
              <li style={emptyItem}>
                No time blocks yet. Click a time slot or use Add time block.
              </li>
            ) : (
              timelineBlocks.map((block, i) => {
                const blockTasks = tasksForBlock(block, tasks);
                const start = new Date(block.startAt);
                return (
                  <li key={block.id} style={blockItem}>
                    <strong>Block {i + 1}</strong>
                    {(block.recurrence || block.seriesId) && <span style={repeatTag}> ↻</span>} —{" "}
                    {formatClockLabel(start.getHours(), start.getMinutes())} · {block.title}
                    {blockTasks.length > 0 && (
                      <span style={linkedTag}>
                        {" "}
                        · {blockTasks.map((t) => t.title).join(", ")}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        <Surface padding="md" variant="overlay" style={timelineWrap}>
          <div style={timelineHeader}>
            <h3 style={heading}>Scheduler</h3>
            <div style={headerActions}>
              <div style={viewToggle}>
                <button
                  type="button"
                  className="sb-pressable"
                  style={viewMode === "day" ? viewActive : viewBtn}
                  onClick={() => setViewMode("day")}
                >
                  Day
                </button>
                <button
                  type="button"
                  className="sb-pressable"
                  style={viewMode === "week" ? viewActive : viewBtn}
                  onClick={() => {
                    setViewMode("week");
                    setSelectedWeekDay(new Date(now));
                  }}
                >
                  Week
                </button>
              </div>
              {viewMode === "week" && (
                <div style={weekDaysRow}>
                  {weekDays.map((d) => (
                    <button
                      key={d.toDateString()}
                      type="button"
                      className="sb-pressable"
                      style={
                        d.toDateString() === timelineDay.toDateString() ? viewActive : viewBtn
                      }
                      onClick={() => setSelectedWeekDay(d)}
                    >
                      {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                    </button>
                  ))}
                </div>
              )}
              <PressableEnergy
                onClick={() =>
                  setSlot({
                    hour: now.getHours(),
                    minute: Math.floor(now.getMinutes() / 15) * 15,
                  })
                }
              >
                + Add time block
              </PressableEnergy>
              <label style={toggle}>
                <input
                  type="checkbox"
                  checked={config?.coloredTimeBlocks ?? true}
                  onChange={async (e) => {
                    const c = await api.configGet();
                    c.coloredTimeBlocks = e.target.checked;
                    setConfig(await api.configSave(c));
                  }}
                />
                Colored timeblocking
              </label>
            </div>
          </div>

          <div style={{ ...timeline, height: `${timelineHeight}px` }}>
            {SCHEDULE_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                className="sb-pressable"
                style={{ ...hourRow, top: `${hourOffsetPx(h, startHour)}px` }}
                onClick={(e) => setSlot(slotFromClick(h, e))}
                title={`Add block at ${formatHourLabel(h)}`}
              >
                <span style={hourLabel}>{formatHourLabel(h)}</span>
                <span style={hourLine} />
              </button>
            ))}

            {nowLineVisible && (
              <div style={{ ...nowLine, top: `${nowTop}px` }}>
                <span style={nowBadge}>
                  {formatClockLabel(now.getHours(), now.getMinutes())}
                </span>
              </div>
            )}

            {timelineBlocks.map((block) => {
              const layout = overlapMap.get(block.id);
              if (!layout) return null;
              const { top, height, widthPct, leftPct } = layout;
              const colored = config?.coloredTimeBlocks ?? true;
              const isDragging = draggingId === block.id;
              const isResizing = resizingId === block.id;
              const blockTasks = tasksForBlock(block, tasks);
              const displayHeight = height + (isResizing ? resizeDelta : 0);
              return (
                <div
                  key={block.id}
                  className={isDragging ? "sb-schedule-block-dragging" : undefined}
                  style={{
                    ...eventBlock,
                    top: `${top + (isDragging ? dragOffset : 0)}px`,
                    height: `${Math.max(displayHeight, 18)}px`,
                    left: `calc(64px + (100% - 72px) * ${leftPct / 100})`,
                    width: `calc((100% - 72px) * ${widthPct / 100} - 2px)`,
                    right: "auto",
                    background: colored
                      ? resolveBlockColor(block.colorToken)
                      : "var(--sb-bg-overlay)",
                    color: colored ? "var(--sb-bg-base)" : "var(--sb-text-primary)",
                  }}
                >
                  <div
                    className="sb-block-drag-handle"
                    onPointerDown={(e) => onBlockDragStart(block.id, e)}
                    title="Drag to reschedule"
                    aria-label="Drag to reschedule"
                  >
                    ⠿
                  </div>
                  <div
                    style={{ ...blockBody, cursor: "pointer" }}
                    onClick={() => setEditBlock(block)}
                    title="Click to edit"
                  >
                    <span style={blockTitle}>
                      {(block.recurrence || block.seriesId) && <span style={repeatMark}>↻ </span>}
                      {block.title}
                    </span>
                    {blockTasks.length > 0 && (
                      <span style={blockTasksStyle}>
                        {blockTasks.map((t) => t.title).join(" · ")}
                      </span>
                    )}
                  </div>
                  <div style={blockActions}>
                    <button
                      type="button"
                      className="sb-pressable sb-pressable-hover"
                      style={taskBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinkTaskBlock(block);
                      }}
                      title="Link a task"
                      aria-label="Link a task to this block"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="sb-pressable sb-pressable-hover"
                      style={deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBlock(block.id);
                      }}
                      title="Delete block"
                      aria-label="Delete block"
                    >
                      ×
                    </button>
                  </div>
                  <div
                    className="sb-block-resize-handle"
                    onPointerDown={(e) => onBlockResizeStart(block.id, e)}
                    title="Drag to resize"
                    aria-label="Drag to resize duration"
                  />
                </div>
              );
            })}
          </div>
        </Surface>
      </div>

      {conflict && (
        <p className="sb-warn-banner" style={conflictBanner}>
          "{conflict.block.title}" overlaps {conflict.conflicts.map((c) => c.title).join(", ")} —{" "}
          <button type="button" style={conflictBtn} onClick={() => resolveConflict("replace")}>
            Replace
          </button>
          {" · "}
          <button type="button" style={conflictBtn} onClick={() => resolveConflict("keep-both")}>
            Keep both
          </button>
          {" · "}
          <button type="button" style={conflictBtn} onClick={() => resolveConflict("cancel")}>
            Cancel
          </button>
        </p>
      )}

      {slot && (
        <AddTimeBlockModal
          initialHour={slot.hour}
          initialMinute={slot.minute}
          localDate={timelineDay}
          tasks={tasks}
          onSave={saveBlock}
          onClose={() => setSlot(null)}
        />
      )}

      {editBlock && (
        <AddTimeBlockModal
          initialHour={new Date(editBlock.startAt).getHours()}
          initialMinute={new Date(editBlock.startAt).getMinutes()}
          localDate={timelineDay}
          editBlock={editBlock}
          tasks={tasks}
          onSave={saveBlock}
          onClose={() => setEditBlock(null)}
        />
      )}

      {linkTaskBlock && (
        <LinkBlockTaskModal
          block={linkTaskBlock}
          tasks={tasks}
          onLinked={refresh}
          onClose={() => setLinkTaskBlock(null)}
        />
      )}

      {pendingTaskBlock && (
        <TaskPromptModal block={pendingTaskBlock} onConfirm={handleTaskPrompt} />
      )}
    </div>
  );
}

const stagingRail = {
  marginBottom: "12px",
  padding: "8px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px dashed var(--sb-border-glow)",
};
const stagingTitle = { fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: "0.08em" };
const viewToggle = { display: "flex", gap: "4px" };
const weekDaysRow = { display: "flex", flexWrap: "wrap" as const, gap: "4px" };
const viewBtn = {
  fontSize: "12px",
  padding: "4px 10px",
  border: "1px solid var(--sb-border-subtle)",
  borderRadius: "var(--sb-radius-sm)",
  background: "transparent",
  cursor: "pointer",
};
const viewActive = { ...viewBtn, background: "var(--sb-bg-overlay)", color: "var(--sb-accent)" };

const layout = {
  display: "grid",
  gridTemplateColumns: "240px 1fr",
  gap: "var(--sb-space-md)",
  minHeight: "520px",
};

const sidebar = {
  padding: "var(--sb-space-md)",
  background: "var(--sb-bg-raised)",
  borderRadius: "var(--sb-radius-md)",
  border: "1px solid var(--sb-border-subtle)",
  alignSelf: "start" as const,
};

const sidebarHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "8px",
};

const heading = { margin: 0, fontSize: "16px" };
const count = { fontSize: "11px", color: "var(--sb-text-muted)" };
const taskList = { margin: 0, padding: 0, listStyle: "none" };
const blockItem = {
  padding: "10px 0",
  borderBottom: "1px solid var(--sb-border-subtle)",
  color: "var(--sb-text-secondary)",
  fontSize: "14px",
};
const emptyItem = {
  padding: "12px 0",
  color: "var(--sb-text-muted)",
  fontSize: "13px",
  lineHeight: 1.5,
};
const linkedTag = { color: "var(--sb-accent)", fontSize: "12px" };
const repeatTag = { color: "var(--sb-text-muted)", fontSize: "11px" };

const timelineWrap = { position: "relative" as const };
const timelineHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "12px",
  flexWrap: "wrap" as const,
  gap: "8px",
};
const headerActions = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap" as const,
};
const toggle = {
  fontSize: "12px",
  color: "var(--sb-text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};
const timeline = {
  position: "relative" as const,
  paddingLeft: "56px",
  marginBottom: "8px",
};
const hourRow = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  height: `${HOUR_ROW_HEIGHT}px`,
  display: "flex",
  alignItems: "flex-start",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
};
const hourLabel = {
  width: "48px",
  marginTop: "-7px",
  fontSize: "12px",
  color: "var(--sb-text-muted)",
  textAlign: "right" as const,
  pointerEvents: "none" as const,
};
const hourLine = {
  flex: 1,
  marginLeft: "8px",
  borderTop: "1px solid var(--sb-border-subtle)",
};
const nowLine = {
  position: "absolute" as const,
  left: "56px",
  right: 0,
  height: "2px",
  background: "var(--sb-accent)",
  zIndex: 2,
  boxShadow: "0 0 8px var(--sb-glow-accent)",
  pointerEvents: "none" as const,
};
const nowBadge = {
  position: "absolute" as const,
  left: "-56px",
  top: "-8px",
  width: "52px",
  textAlign: "right" as const,
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--sb-accent)",
};
const eventBlock = {
  position: "absolute" as const,
  borderRadius: "var(--sb-radius-sm)",
  padding: "4px 4px 8px 0",
  fontSize: "12px",
  overflow: "hidden",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
  gap: "2px",
};
const blockBody = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "2px",
  minWidth: 0,
  flex: 1,
};
const blockTitle = {
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};
const repeatMark = { opacity: 0.85, fontSize: "11px" };
const blockTasksStyle = {
  fontSize: "10px",
  opacity: 0.9,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};
const blockActions = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "2px",
  flexShrink: 0,
};
const taskBtn = {
  border: "none",
  background: "rgba(0,0,0,0.25)",
  color: "inherit",
  borderRadius: "4px",
  width: "18px",
  height: "18px",
  cursor: "pointer",
  lineHeight: 1,
  fontSize: "14px",
};
const deleteBtn = {
  border: "none",
  background: "rgba(0,0,0,0.25)",
  color: "inherit",
  borderRadius: "4px",
  width: "18px",
  height: "18px",
  cursor: "pointer",
  lineHeight: 1,
  fontSize: "14px",
};
const conflictBanner = {
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,180,80,0.12)",
};
const conflictBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-accent)",
  cursor: "pointer",
  font: "inherit",
  textDecoration: "underline",
  padding: 0,
};
