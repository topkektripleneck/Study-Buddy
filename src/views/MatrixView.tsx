import { useCallback, useEffect, useMemo, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { removeFromMatrix, setQuadrant } from "@/lib/actions";
import { api } from "@/lib/api";
import { GlowBorder, Surface } from "@/ui/kit";
import {
  QUADRANT_META,
  type EisenhowerMatrixFile,
  type EisenhowerQuadrant,
  type TaskItem,
} from "@/types";

const QUADRANTS: EisenhowerQuadrant[] = ["do_first", "schedule", "delegate", "eliminate"];

export function MatrixView() {
  const [matrix, setMatrix] = useState<EisenhowerMatrixFile | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
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
  }, [refresh]);

  useListen(refresh, "matrix:changed", "tasks:changed");

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const unplaced = useMemo(() => {
    const placed = new Set(matrix?.items.map((i) => i.taskId) ?? []);
    return tasks.filter((t) => !placed.has(t.id) && t.status !== "done" && t.status !== "archived");
  }, [matrix, tasks]);

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    const result = await action();
    if (!result.ok) setError(result.message);
    await refresh();
  }

  if (!matrix) {
    if (error) return <p style={errorBanner}>{error}</p>;
    return null;
  }

  return (
    <div>
      <div style={headerRow}>
        <h2 style={title}>Eisenhower Matrix</h2>
        <span style={hint}>{unplaced.length} unplaced</span>
      </div>
      {error && <p style={errorBanner}>{error}</p>}

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
                        <span style={cardLabel}>{task?.title ?? "Unknown"}</span>
                        <select
                          style={moveSelect}
                          value={quadrant}
                          onChange={(e) => {
                            const next = QUADRANTS.find((q) => q === e.target.value);
                            if (next) run(() => setQuadrant(item.taskId, next));
                          }}
                        >
                          {QUADRANTS.map((q) => (
                            <option key={q} value={q}>
                              {QUADRANT_META[q].title}
                            </option>
                          ))}
                        </select>
                        <button type="button" style={removeBtn} onClick={() => run(() => removeFromMatrix(item.id))}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                  {ids.length === 0 && <li style={empty}>Nothing here</li>}
                </ul>

                {unplaced.length > 0 && (
                  <select
                    style={addSelect}
                    defaultValue=""
                    onChange={(e) => {
                      const taskId = e.target.value;
                      if (!taskId) return;
                      e.target.value = "";
                      run(() => setQuadrant(taskId, quadrant));
                    }}
                  >
                    <option value="">+ Add task…</option>
                    {unplaced.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
              </Surface>
            </GlowBorder>
          );
        })}
      </div>
    </div>
  );
}

const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" };
const title = { margin: 0, fontSize: "22px" };
const hint = { fontSize: "12px", color: "var(--sb-text-muted)" };
const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sb-space-md)" };
const quadrantCard = { minHeight: "200px" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const count = { fontFamily: "var(--sb-font-mono)", color: "var(--sb-accent)" };
const subtitle = { margin: "4px 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
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
};
const removeBtn = { border: "none", background: "transparent", color: "var(--sb-text-muted)", cursor: "pointer", fontSize: "16px" };
const empty = { color: "var(--sb-text-muted)", fontStyle: "italic", padding: "8px 0" };
const addSelect = { marginTop: "10px", width: "100%", fontSize: "12px", padding: "6px", borderRadius: "var(--sb-radius-sm)" };
const errorBanner = {
  margin: "0 0 12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(255,100,100,0.12)",
  color: "#ffaaaa",
  fontSize: "13px",
};
