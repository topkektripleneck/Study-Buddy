import { useCallback, useEffect, useMemo, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { createTask, deleteTask, toggleTaskDone } from "@/lib/actions";
import { api } from "@/lib/api";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { TaskItem } from "@/types";

export function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.tasksList());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tasks");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useListen(refresh, "tasks:changed");

  const { open, done } = useMemo(
    () => ({
      open: tasks.filter((t) => t.status !== "done" && t.status !== "archived"),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  const visible = showDone ? [...open, ...done] : open;

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    const result = await action();
    if (!result.ok) setError(result.message);
    await refresh();
  }

  return (
    <Surface padding="md">
      <div style={headerRow}>
        <h3 style={title}>Tasks</h3>
        <span style={counts}>
          {open.length} open · {done.length} done
        </span>
      </div>

      {error && <p style={errorText}>{error}</p>}

      <div style={row}>
        <input
          className="sb-input"
          style={{ flex: 1, padding: "8px 12px" }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New task..."
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const title = draft.trim();
            if (!title) return;
            setDraft("");
            run(() => createTask(title));
          }}
        />
        <PressableEnergy
          onClick={() => {
            const title = draft.trim();
            if (!title) return;
            setDraft("");
            run(() => createTask(title));
          }}
        >
          Add
        </PressableEnergy>
      </div>

      <ul style={list}>
        {visible.map((task) => {
          const isDone = task.status === "done";
          return (
            <li key={task.id} style={item}>
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => run(() => toggleTaskDone(task.id))}
                aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
              />
              <span style={{ ...label, ...(isDone ? doneLabel : {}) }}>{task.title}</span>
              <button
                type="button"
                style={removeBtn}
                onClick={() => run(() => deleteTask(task.id))}
                title="Delete task"
              >
                ×
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li style={empty}>{showDone ? "No tasks yet" : "Nothing open — nice"}</li>
        )}
      </ul>

      {done.length > 0 && (
        <button type="button" style={linkBtn} onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Hide completed" : `Show ${done.length} completed`}
        </button>
      )}
    </Surface>
  );
}

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: "12px",
};
const title = { margin: 0, fontSize: "16px" };
const counts = { fontSize: "11px", color: "var(--sb-text-muted)" };
const row = { display: "flex", gap: "8px", marginBottom: "12px" };
const list = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  maxHeight: "220px",
  overflowY: "auto" as const,
};
const item = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 0",
  borderBottom: "1px solid var(--sb-border-subtle)",
};
const label = { flex: 1, fontSize: "14px" };
const doneLabel = {
  textDecoration: "line-through",
  color: "var(--sb-text-muted)",
};
const removeBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
};
const empty = { color: "var(--sb-text-muted)", fontStyle: "italic", padding: "8px 0" };
const linkBtn = {
  marginTop: "10px",
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  textDecoration: "underline",
  padding: 0,
};
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "#ffaaaa" };
