import { useState } from "react";
import type { CalendarTimeBlock, TaskItem } from "@/types";
import { linkBlockToTask, linkTaskToBlock } from "@/lib/actions";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

interface LinkBlockTaskModalProps {
  block: CalendarTimeBlock;
  tasks: TaskItem[];
  onLinked: () => void;
  onClose: () => void;
}

export function LinkBlockTaskModal({ block, tasks, onLinked, onClose }: LinkBlockTaskModalProps) {
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "archived");

  async function createNew() {
    setBusy(true);
    setError(null);
    const result = await linkBlockToTask(block);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onLinked();
    onClose();
  }

  async function linkExisting() {
    if (!taskId) return;
    setBusy(true);
    setError(null);
    const result = await linkTaskToBlock(block, taskId);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onLinked();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose} backdropStyle={{ zIndex: 110 }} panelStyle={panel}>
      <h2 style={heading}>Add task to block</h2>
      <p style={body}>
        Link a task to <strong>{block.title}</strong>
      </p>
      {error && <p style={errorText}>{error}</p>}
      <label style={label}>
        Existing task
        <select
          className="sb-input"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          disabled={busy}
        >
          <option value="">Choose a task…</option>
          {openTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
      </label>
      <div style={actions}>
        <PressableEnergy onClick={linkExisting} disabled={busy || !taskId}>
          Link task
        </PressableEnergy>
        <PressableEnergy onClick={createNew} disabled={busy}>
          Create new task
        </PressableEnergy>
        <PressableEnergy variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </PressableEnergy>
      </div>
    </ModalBackdrop>
  );
}

const panel = { width: "min(400px, 92vw)" };
const heading = { margin: "0 0 8px", fontSize: "18px" };
const body = { margin: "0 0 12px", color: "var(--sb-text-secondary)", lineHeight: 1.5 };
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "var(--sb-error)" };
const label = { display: "flex", flexDirection: "column" as const, gap: "6px", fontSize: "13px", marginBottom: "12px" };
const actions = { display: "flex", flexWrap: "wrap" as const, gap: "8px" };
