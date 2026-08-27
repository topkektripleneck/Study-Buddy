import { useEffect, useState } from "react";
import { PressableEnergy, Surface } from "@/ui/kit";
import { api } from "@/lib/api";
import type { TaskItem } from "@/types";

export function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.tasksList().then(setTasks).catch(console.error);
  }, []);

  async function addTask() {
    if (!draft.trim()) return;
    const task = await api.taskCreate(draft.trim());
    setTasks((prev) => [...prev, task]);
    setDraft("");
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Tasks</h3>
      <div style={row}>
        <input
          style={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New task..."
          onKeyDown={(e) => e.key === "Enter" && addTask()}
        />
        <PressableEnergy onClick={addTask}>Add</PressableEnergy>
      </div>
      <ul style={list}>
        {tasks.slice(0, 6).map((t) => (
          <li key={t.id} style={item}>
            {t.title}
          </li>
        ))}
        {tasks.length === 0 && <li style={empty}>No tasks yet</li>}
      </ul>
    </Surface>
  );
}

const title = { margin: "0 0 12px", fontSize: "16px" };
const row = { display: "flex", gap: "8px", marginBottom: "12px" };
const input = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
};
const list = { margin: 0, padding: 0, listStyle: "none" };
const item = { padding: "6px 0", borderBottom: "1px solid var(--sb-border-subtle)" };
const empty = { color: "var(--sb-text-muted)", fontStyle: "italic" };
