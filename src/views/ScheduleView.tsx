import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddTimeBlockModal, type TimeBlockDraft } from "@/components/AddTimeBlockModal";
import { TaskPromptModal } from "@/components/TaskPromptModal";
import { api } from "@/lib/api";
import {
  SCHEDULE_HOURS,
  blockLayout,
  createTimeBlock,
  formatHourLabel,
  isSameLocalDay,
} from "@/lib/schedule";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { AppConfig, CalendarTimeBlock, TaskItem } from "@/types";

const COLOR_MAP: Record<string, string> = {
  accent: "var(--sb-accent)",
  warm: "#ffb060",
  success: "#6effb4",
  admin: "#a78bfa",
};

export function ScheduleView() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [blocks, setBlocks] = useState<CalendarTimeBlock[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [modalHour, setModalHour] = useState<number | null>(null);
  const [pendingTaskBlock, setPendingTaskBlock] = useState<CalendarTimeBlock | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const startHour = SCHEDULE_HOURS[0];
  const endHour = SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const rangeMinutes = (endHour - startHour) * 60;
  const nowTop = ((nowMinutes - startHour * 60) / rangeMinutes) * 100;

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
    const unsubs: (() => void)[] = [];
    listen("calendar:changed", () => refresh()).then((u) => unsubs.push(u));
    listen("tasks:changed", () => refresh()).then((u) => unsubs.push(u));
    listen("config:changed", () => refresh()).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [refresh]);

  const todayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => isSameLocalDay(b.startAt, now))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [blocks, now],
  );

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  async function saveBlock(draft: TimeBlockDraft) {
    try {
      const block = createTimeBlock(draft);
      const saved = await api.calendarSaveBlock(block);
      setBlocks((prev) => [...prev, saved]);
      setModalHour(null);

      const shouldPrompt = config?.promptTaskOnBlockCreate ?? true;
      if (shouldPrompt) {
        setPendingTaskBlock(saved);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save time block");
    }
  }

  async function handleTaskPrompt(createTask: boolean) {
    if (!pendingTaskBlock) return;
    const block = pendingTaskBlock;
    setPendingTaskBlock(null);

    if (!createTask) return;

    try {
      const task = await api.taskCreate(block.title);
      const linkedTask: TaskItem = {
        ...task,
        linkedBlockIds: [...task.linkedBlockIds, block.id],
        estimateMinutes: Math.round(
          (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000,
        ),
      };
      await api.taskUpdate(linkedTask);

      const linkedBlock: CalendarTimeBlock = {
        ...block,
        taskId: task.id,
        updatedAt: new Date().toISOString(),
      };
      await api.calendarSaveBlock(linkedBlock);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create linked task");
    }
  }

  async function deleteBlock(blockId: string) {
    try {
      await api.calendarDeleteBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete block");
    }
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
                return (
                  <li key={block.id} style={blockItem}>
                    <strong>Block {i + 1}</strong> — {block.title}
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
              <PressableEnergy onClick={() => setModalHour(now.getHours())}>
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

          <div style={timeline}>
            {SCHEDULE_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                style={hourRow}
                onClick={() => setModalHour(h)}
                title={`Add block at ${formatHourLabel(h)}`}
              >
                <span style={hourLabel}>{formatHourLabel(h)}</span>
                <div style={hourLine} />
              </button>
            ))}

            {nowTop >= 0 && nowTop <= 100 && (
              <div style={{ ...nowLine, top: `${nowTop}%` }}>
                <span style={nowArrow}>▶</span>
              </div>
            )}

            {todayBlocks.map((block) => {
              const { top, height } = blockLayout(block, startHour, endHour);
              const colored = config?.coloredTimeBlocks ?? true;
              return (
                <div
                  key={block.id}
                  style={{
                    ...eventBlock,
                    top: `${top}%`,
                    height: `${height}%`,
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
                      deleteBlock(block.id);
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

      {modalHour !== null && (
        <AddTimeBlockModal
          initialHour={modalHour}
          onSave={saveBlock}
          onClose={() => setModalHour(null)}
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
  minHeight: "440px",
  paddingLeft: "56px",
};
const hourRow = {
  display: "flex",
  alignItems: "center",
  height: "48px",
  position: "relative" as const,
  width: "100%",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
};
const hourLabel = {
  position: "absolute" as const,
  left: "-52px",
  width: "48px",
  fontSize: "12px",
  color: "var(--sb-text-muted)",
  textAlign: "right" as const,
  pointerEvents: "none" as const,
};
const hourLine = {
  flex: 1,
  borderTop: "1px solid var(--sb-border-subtle)",
};
const nowLine = {
  position: "absolute" as const,
  left: "0",
  right: "0",
  height: "2px",
  background: "var(--sb-accent)",
  zIndex: 2,
  boxShadow: "0 0 8px var(--sb-glow-accent)",
  pointerEvents: "none" as const,
};
const nowArrow = {
  position: "absolute" as const,
  left: "-16px",
  top: "-8px",
  color: "var(--sb-accent)",
  fontSize: "12px",
};
const eventBlock = {
  position: "absolute" as const,
  left: "56px",
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
const errorBanner = {
  margin: "0 0 12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,100,100,0.12)",
  color: "#ffaaaa",
  fontSize: "13px",
};
