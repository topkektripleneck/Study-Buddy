import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { createTask, deleteTask, reorderTasks, toggleTaskDone, updateTask } from "@/lib/actions";
import { api } from "@/lib/api";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { Priority, TaskItem } from "@/types";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "critical", label: "!" },
  { value: "high", label: "↑" },
  { value: "normal", label: "·" },
  { value: "low", label: "↓" },
];

function SortableTaskRow({
  task,
  editingId,
  editTitle,
  onEditTitle,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onToggle,
  onDelete,
  onPriority,
  onDue,
}: {
  task: TaskItem;
  editingId: string | null;
  editTitle: string;
  onEditTitle: (v: string) => void;
  onStartEdit: (task: TaskItem) => void;
  onCommitEdit: (task: TaskItem) => void;
  onCancelEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onPriority: (priority: Priority) => void;
  onDue: (dueAt: string | null) => void;
}) {
  const isDone = task.status === "done";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={{ ...item, ...style }}>
      <button
        type="button"
        className="sb-pressable"
        style={dragHandle}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ⠿
      </button>
      <input
        type="checkbox"
        checked={isDone}
        onChange={onToggle}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />
      {editingId === task.id ? (
        <input
          className="sb-input"
          style={{ flex: 1, padding: "4px 8px", fontSize: "14px" }}
          value={editTitle}
          autoFocus
          onChange={(e) => onEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitEdit(task);
            if (e.key === "Escape") onCancelEdit();
          }}
          onBlur={() => onCommitEdit(task)}
        />
      ) : (
        <span
          style={{ ...label, ...(isDone ? doneLabel : {}) }}
          onDoubleClick={() => onStartEdit(task)}
          title="Double-click to rename"
        >
          {task.title}
        </span>
      )}
      <select
        className="sb-input"
        style={prioritySelect}
        value={task.priority}
        onChange={(e) => onPriority(e.target.value as Priority)}
        aria-label="Priority"
        title="Priority"
      >
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        className="sb-input"
        style={dueInput}
        value={task.dueAt ? task.dueAt.slice(0, 10) : ""}
        onChange={(e) =>
          onDue(e.target.value ? `${e.target.value}T12:00:00.000Z` : null)
        }
        aria-label="Due date"
        title="Due date"
      />
      <button
        type="button"
        className="sb-pressable sb-pressable-hover"
        style={removeBtn}
        onClick={onDelete}
        title="Delete task"
        aria-label="Delete task"
      >
        ×
      </button>
    </li>
  );
}

export function TasksWidget() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
      open: tasks
        .filter((t) => t.status !== "done" && t.status !== "archived")
        .sort((a, b) => a.order - b.order),
      done: tasks.filter((t) => t.status === "done"),
    }),
    [tasks],
  );

  const visible = showDone ? [...open, ...done] : open;
  const sortableIds = open.map((t) => t.id);

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    const result = await action();
    if (!result.ok) setError(result.message);
    await refresh();
  }

  async function patchTask(task: TaskItem, patch: Partial<TaskItem>) {
    await run(() => updateTask({ ...task, ...patch }));
  }

  function startEdit(task: TaskItem) {
    setEditingId(task.id);
    setEditTitle(task.title);
  }

  async function commitEdit(task: TaskItem) {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title || title === task.title) return;
    await patchTask(task, { title });
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortableIds, oldIndex, newIndex);
    await run(() => reorderTasks(next));
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul style={list}>
            {(showDone ? open : visible).map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                editingId={editingId}
                editTitle={editTitle}
                onEditTitle={setEditTitle}
                onStartEdit={startEdit}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingId(null)}
                onToggle={() => run(() => toggleTaskDone(task.id))}
                onDelete={() => run(() => deleteTask(task.id))}
                onPriority={(priority) => patchTask(task, { priority })}
                onDue={(dueAt) => patchTask(task, { dueAt })}
              />
            ))}
            {showDone &&
              done.map((task) => (
                <li key={task.id} style={item}>
                  <span style={{ width: 18 }} />
                  <input
                    type="checkbox"
                    checked
                    onChange={() => run(() => toggleTaskDone(task.id))}
                    aria-label={`Reopen ${task.title}`}
                  />
                  <span style={{ ...label, ...doneLabel }}>{task.title}</span>
                </li>
              ))}
            {visible.length === 0 && (
              <li style={empty}>{showDone ? "No tasks yet" : "Nothing open — nice"}</li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

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
  maxHeight: "280px",
  overflowY: "auto" as const,
};
const item = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 0",
  borderBottom: "1px solid var(--sb-border-subtle)",
};
const dragHandle = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "grab",
  padding: "0 2px",
  font: "inherit",
  fontSize: "12px",
};
const label = { flex: 1, fontSize: "14px", minWidth: 0 };
const doneLabel = {
  textDecoration: "line-through",
  color: "var(--sb-text-muted)",
};
const prioritySelect = {
  width: "36px",
  padding: "2px",
  fontSize: "12px",
};
const dueInput = {
  width: "110px",
  padding: "2px 4px",
  fontSize: "11px",
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
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "var(--sb-error)" };
