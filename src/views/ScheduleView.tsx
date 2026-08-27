import { useCallback, useEffect, useMemo, useState } from "react";
import { AddTimeBlockModal } from "@/components/AddTimeBlockModal";
import { TaskPromptModal } from "@/components/TaskPromptModal";
import { useListen } from "@/hooks/useListen";
import { useNow } from "@/hooks/useNow";
import { addBlock, deleteBlock, linkBlockToTask, resolveBlockConflict } from "@/lib/actions";
import { api } from "@/lib/api";
import {
  HOUR_ROW_HEIGHT,
  SCHEDULE_HOURS,
  blockLayoutPx,
  endTimeFrom,
  formatClockLabel,
  formatHourLabel,
  hourOffsetPx,
  isSameLocalDay,
  timeOffsetPx,
  timelineHeightPx,
} from "@/lib/schedule";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { AppConfig, CalendarTimeBlock, PendingConflict, TaskItem, TimeBlockDraft } from "@/types";

const COLOR_MAP: Record<string, string> = {
  accent: "var(--sb-accent)",
  warm: "#ffb060",
  success: "#6effb4",
  admin: "#a78bfa",
};

interface SlotTarget {
  hour: number;
  minute: number;
}

export function ScheduleView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [blocks, setBlocks] = useState<CalendarTimeBlock[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [slot, setSlot] = useState<SlotTarget | null>(null);
  const [pendingTaskBlock, setPendingTaskBlock] = useState<CalendarTimeBlock | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = useNow(15_000);
  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1;
  const timelineHeight = timelineHeightPx(startHour, endHour);
  const nowTop = timeOffsetPx(now, startHour);
  const nowVisible = nowTop >= 0 && nowTop <= timelineHeight;

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

  const todayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => isSameLocalDay(b.startAt))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [blocks],
  );

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  /** Converts a click inside an hour row into an hour + quarter-hour target. */
  function slotFromClick(hour: number, event: React.MouseEvent<HTMLButtonElement>): SlotTarget {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top) / bounds.height;
    const minute = Math.min(45, Math.max(0, Math.round((ratio * 60) / 15) * 15));
    return { hour, minute };
  }

  function afterBlockSaved(saved: CalendarTimeBlock) {
    setSlot(null);
    setConflict(null);
    refresh();
    if (config?.promptTaskOnBlockCreate ?? true) {
      setPendingTaskBlock(saved);
    }
  }

  async function saveBlock(draft: TimeBlockDraft) {
    const start = { hour: draft.hour, minute: draft.minute };
    const outcome = await addBlock({
      title: draft.title,
      kind: draft.kind,
      start,
      end: endTimeFrom(start, draft.durationMinutes),
    });

    if (outcome.block && outcome.conflicts.length > 0) {
      setConflict({ block: outcome.block, conflicts: outcome.conflicts });
      return;
    }
    if (!outcome.ok || !outcome.block) {
      setError(outcome.message);
      return;
    }
    afterBlockSaved(outcome.block);
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

  return (
    <div>
      {error && (
        <p style={errorBanner} role="alert">
          {error}
        </p>
      )}

      <div style={layout}>
        <aside style={sidebar}>
          <div style={sidebarHeader}>
            <h3 style={heading}>Tasks</h3>
            <span style={count}>{todayBlocks.length} blocks today</span>
          </div>
          <ul style={taskList}>
            {todayBlocks.length === 0 ? (
              <li style={emptyItem}>
                No time blocks yet. Click a time slot or use Add time block.
              </li>
            ) : (
              todayBlocks.map((block, i) => {
                const linked = block.taskId ? taskById.get(block.taskId) : null;
                const start = new Date(block.startAt);
                return (
                  <li key={block.id} style={blockItem}>
                    <strong>Block {i + 1}</strong> —{" "}
                    {formatClockLabel(start.getHours(), start.getMinutes())} · {block.title}
                    {linked && <span style={linkedTag}> · task linked</span>}
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
                style={{ ...hourRow, top: `${hourOffsetPx(h, startHour)}px` }}
                onClick={(e) => setSlot(slotFromClick(h, e))}
                title={`Add block at ${formatHourLabel(h)}`}
              >
                <span style={hourLabel}>{formatHourLabel(h)}</span>
                <span style={hourLine} />
              </button>
            ))}

            {nowVisible && (
              <div style={{ ...nowLine, top: `${nowTop}px` }}>
                <span style={nowBadge}>
                  {formatClockLabel(now.getHours(), now.getMinutes())}
                </span>
              </div>
            )}

            {todayBlocks.map((block) => {
              const { top, height } = blockLayoutPx(block, startHour);
              const colored = config?.coloredTimeBlocks ?? true;
              return (
                <div
                  key={block.id}
                  style={{
                    ...eventBlock,
                    top: `${top}px`,
                    height: `${height}px`,
                    background: colored
                      ? COLOR_MAP[block.colorToken] ?? "var(--sb-accent-dim)"
                      : "var(--sb-bg-overlay)",
                    color: colored ? "var(--sb-bg-base)" : "var(--sb-text-primary)",
                  }}
                >
                  <span>{block.title}</span>
                  <button
                    type="button"
                    style={deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBlock(block.id);
                    }}
                    title="Delete block"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </Surface>
      </div>

      {conflict && (
        <p style={conflictBanner}>
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
          onSave={saveBlock}
          onClose={() => setSlot(null)}
        />
      )}

      {pendingTaskBlock && (
        <TaskPromptModal block={pendingTaskBlock} onConfirm={handleTaskPrompt} />
      )}
    </div>
  );
}

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
  left: "64px",
  right: "8px",
  borderRadius: "var(--sb-radius-sm)",
  padding: "4px 24px 4px 8px",
  fontSize: "12px",
  overflow: "hidden",
  zIndex: 1,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
};
const deleteBtn = {
  position: "absolute" as const,
  top: "2px",
  right: "4px",
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
  margin: "0 0 12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,180,80,0.12)",
  color: "#ffcc88",
  fontSize: "13px",
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
const errorBanner = {
  margin: "0 0 12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,100,100,0.12)",
  color: "#ffaaaa",
  fontSize: "13px",
};
