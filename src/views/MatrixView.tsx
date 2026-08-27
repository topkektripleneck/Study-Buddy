import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { GlowBorder, Surface } from "@/ui/kit";
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

  useEffect(() => {
    Promise.all([api.matrixGet(), api.tasksList()]).then(([m, t]) => {
      setMatrix(m);
      setTasks(t);
    });
  }, []);

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title])),
    [tasks],
  );

  if (!matrix) return null;

  return (
    <div>
      <h2 style={title}>Eisenhower Matrix</h2>
      <div style={grid}>
        {QUADRANTS.map((q) => {
          const ids = matrix.quadrantOrder[q] ?? [];
          const meta = QUADRANT_META[q];
          return (
            <GlowBorder key={q} tone={q === "do_first" ? "accent" : "warm"}>
              <Surface padding="md" variant="overlay" style={quadrant}>
                <div style={header}>
                  <strong>{meta.title}</strong>
                  <span style={count}>{ids.length}</span>
                </div>
                <p style={subtitle}>{meta.subtitle}</p>
                <ul style={list}>
                  {ids.map((id) => {
                    const item = matrix.items.find((i) => i.id === id);
                    const label = item
                      ? taskMap.get(item.taskId) ?? "Untitled task"
                      : "Unknown";
                    return (
                      <li key={id} style={card}>
                        {label}
                      </li>
                    );
                  })}
                  {ids.length === 0 && (
                    <li style={empty}>Drop tasks here</li>
                  )}
                </ul>
              </Surface>
            </GlowBorder>
          );
        })}
      </div>
    </div>
  );
}

const title = { margin: "0 0 16px", fontSize: "22px" };
const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--sb-space-md)",
};
const quadrant = { minHeight: "200px" };
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
  padding: "8px 10px",
  marginBottom: "6px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-base)",
  border: "1px solid var(--sb-border-subtle)",
};
const empty = {
  color: "var(--sb-text-muted)",
  fontStyle: "italic",
  padding: "8px 0",
};
