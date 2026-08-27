import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { removeFromMatrix, setQuadrant } from "@/lib/actions";
import { api } from "@/lib/api";
import { GlowBorder, PressableEnergy, Surface } from "@/ui/kit";
import {
  QUADRANT_META,
  type EisenhowerMatrixFile,
  type EisenhowerQuadrant,
  type TaskItem,
} from "@/types";

const QUADRANTS: EisenhowerQuadrant[] = [
  "do_first",
  "schedule",
  "delegate",
  "eliminate",
];

export function MatrixView() {
  const [matrix, setMatrix] = useState<EisenhowerMatrixFile | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [picker, setPicker] = useState<EisenhowerQuadrant | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([api.matrixGet(), api.tasksList()]);
      setMatrix(m);
      setTasks(t);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the matrix");
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubs: (() => void)[] = [];
    listen("matrix:changed", () => refresh()).then((u) => unsubs.push(u));
    listen("tasks:changed", () => refresh()).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [refresh]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const unplaced = useMemo(() => {
    const placed = new Set(matrix?.items.map((i) => i.taskId) ?? []);
    return tasks.filter(
      (t) => !placed.has(t.id) && t.status !== "done" && t.status !== "archived",
    );
  }, [matrix, tasks]);

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    try {
      const result = await action();
      if (!result.ok) setError(result.message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  if (!matrix) return null;

  return (
    <div>
      <div style={headerRow}>
        <h2 style={title}>Eisenhower Matrix</h2>
        <span style={hint}>{unplaced.length} unplaced tasks</span>
      </div>

      {error && (
        <p style={errorBanner} role="alert">
          {error}
        </p>
      )}

      <div style={grid}>
        {QUADRANTS.map((quadrant) => {
          const ids = matrix.quadrantOrder[quadrant] ?? [];
          const meta = QUADRANT_META[quadrant];
          return (
            <GlowBorder key={quadrant} tone={quadrant === "do_first" ? "accent" : "warm"}>
              <Surface padding="md" variant="overlay" style={quadrantCard}>
                <div style={header}>
                  <strong>{meta.title}</strong>
                  <span style={count}>{ids.length}</span>
                </div>
                <p style={subtitle}>{meta.subtitle}</p>

                <ul style={list}>
                  {ids.map((id) => {
                    const item = matrix.items.find((i) => i.id === id);
                    const task = item ? taskById.get(item.taskId) : undefined;
                    if (!item) return null;
                    return (
                      <li key={id} style={card}>
                        <span style={cardLabel}>{task?.title ?? "Unknown task"}</span>
                        <select
                          style={moveSelect}
                          value={quadrant}
                          onChange={(e) =>
                            run(() =>
                              setQuadrant(
                                item.taskId,
                                e.target.value as EisenhowerQuadrant,
                              ),
                            )
                          }
                          aria-label="Move to quadrant"
                        >
                          {QUADRANTS.map((q) => (
                            <option key={q} value={q}>
                              {QUADRANT_META[q].title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          style={removeBtn}
                          onClick={() => run(() => removeFromMatrix(item.id))}
                          title="Remove from matrix"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                  {ids.length === 0 && <li style={empty}>Nothing here yet</li>}
                </ul>

                <button
                  type="button"
                  style={addBtn}
                  onClick={() => setPicker(quadrant)}
                  disabled={unplaced.length === 0}
                >
                  {unplaced.length === 0 ? "No unplaced tasks" : "+ Add task"}
                </button>
              </Surface>
            </GlowBorder>
          );
        })}
      </div>

      {picker && (
        <TaskPicker
          quadrant={picker}
          tasks={unplaced}
          onPick={(taskId) => {
            setPicker(null);
            run(() => setQuadrant(taskId, picker));
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function TaskPicker({
  quadrant,
  tasks,
  onPick,
  onClose,
}: {
  quadrant: EisenhowerQuadrant;
  tasks: TaskItem[];
  onPick: (taskId: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <Surface
        padding="lg"
        variant="overlay"
        style={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={pickerTitle}>Add to {QUADRANT_META[quadrant].title}</h3>
        <ul style={pickerList}>
          {tasks.map((task) => (
            <li key={task.id}>
              <button type="button" style={pickerItem} onClick={() => onPick(task.id)}>
                {task.title}
              </button>
            </li>
          ))}
        </ul>
        <PressableEnergy variant="ghost" onClick={onClose}>
          Cancel
        </PressableEnergy>
      </Surface>
    </div>
  );
}

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "16px",
};
const title = { margin: 0, fontSize: "22px" };
const hint = { fontSize: "12px", color: "var(--sb-text-muted)" };
const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--sb-space-md)",
};
const quadrantCard = { minHeight: "200px" };
const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
const count = {
  fontFamily: "var(--sb-font-mono)",
  color: "var(--sb-accent)",
};
const subtitle = {
  margin: "4px 0 12px",
  fontSize: "12px",
  color: "var(--sb-text-muted)",
};
const list = { margin: 0, padding: 0, listStyle: "none" };
const card = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 10px",
  marginBottom: "6px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-base)",
  border: "1px solid var(--sb-border-subtle)",
};
const cardLabel = { flex: 1, fontSize: "13px" };
const moveSelect = {
  background: "var(--sb-bg-overlay)",
  color: "var(--sb-text-secondary)",
  border: "1px solid var(--sb-border-subtle)",
  borderRadius: "var(--sb-radius-sm)",
  fontSize: "11px",
  padding: "2px 4px",
};
const removeBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
};
const empty = {
  color: "var(--sb-text-muted)",
  fontStyle: "italic",
  padding: "8px 0",
};
const addBtn = {
  marginTop: "10px",
  width: "100%",
  padding: "6px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px dashed var(--sb-border-subtle)",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
};
const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};
const panel = { width: "min(420px, 92vw)" };
const pickerTitle = { margin: "0 0 12px", fontSize: "16px" };
const pickerList = {
  margin: "0 0 12px",
  padding: 0,
  listStyle: "none",
  maxHeight: "300px",
  overflowY: "auto" as const,
};
const pickerItem = {
  width: "100%",
  textAlign: "left" as const,
  padding: "8px 10px",
  marginBottom: "4px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "13px",
};
const errorBanner = {
  margin: "0 0 12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,100,100,0.12)",
  color: "#ffaaaa",
  fontSize: "13px",
};
