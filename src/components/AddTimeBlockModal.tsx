import { useState } from "react";
import type { BlockKind, CalendarTimeBlock, RecurrenceFrequency, TaskItem, TimeBlockDraft } from "@/types";
import { BLOCK_KINDS, formatHourLabel, minutesBetween } from "@/lib/schedule";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

const MINUTES = [0, 15, 30, 45];

const RECURRENCE_OPTIONS: { value: RecurrenceFrequency | ""; label: string }[] = [
  { value: "", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "weekdays", label: "Every weekday" },
];

interface AddTimeBlockModalProps {
  initialHour: number;
  initialMinute?: number;
  localDate?: Date;
  tasks?: TaskItem[];
  editBlock?: CalendarTimeBlock;
  onSave: (draft: TimeBlockDraft) => void;
  onClose: () => void;
}

function blockDefaults(editBlock?: CalendarTimeBlock) {
  if (!editBlock) {
    return {
      title: "",
      hour: 8,
      minute: 0,
      durationMinutes: 60,
      kind: "focus" as BlockKind,
      recurrence: "" as RecurrenceFrequency | "",
    };
  }
  const start = new Date(editBlock.startAt);
  const end = new Date(editBlock.endAt);
  return {
    title: editBlock.title,
    hour: start.getHours(),
    minute: start.getMinutes(),
    durationMinutes: minutesBetween(
      { hour: start.getHours(), minute: start.getMinutes() },
      { hour: end.getHours(), minute: end.getMinutes() },
    ),
    kind: editBlock.kind,
    recurrence: (editBlock.recurrence?.frequency ?? "") as RecurrenceFrequency | "",
  };
}

export function AddTimeBlockModal({
  initialHour,
  initialMinute = 0,
  localDate,
  tasks = [],
  editBlock,
  onSave,
  onClose,
}: AddTimeBlockModalProps) {
  const defaults = blockDefaults(editBlock);
  const [title, setTitle] = useState(defaults.title);
  const [hour, setHour] = useState(editBlock ? defaults.hour : initialHour);
  const [minute, setMinute] = useState(editBlock ? defaults.minute : initialMinute);
  const [durationMinutes, setDurationMinutes] = useState(defaults.durationMinutes);
  const [kind, setKind] = useState<BlockKind>(defaults.kind);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "">(defaults.recurrence);
  const [taskLink, setTaskLink] = useState<"none" | "new" | string>("none");

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "archived");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title,
      hour,
      minute,
      durationMinutes,
      kind,
      localDate,
      recurrence: recurrence ? { frequency: recurrence } : null,
      taskLink,
    });
  }

  return (
    <ModalBackdrop onClose={onClose} panelStyle={panel}>
      <h2 style={heading}>{editBlock ? "Edit time block" : "Add time block"}</h2>
      <p style={hint}>
        {editBlock ? "Update this block on the timeline." : "Click a time slot on the timeline or use this form."}
      </p>
      <form onSubmit={submit} style={form}>
        <label style={label}>
          Title
          <input
            className="sb-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deep work, Essay, Break..."
            autoFocus
            required
          />
        </label>

        <div style={row}>
          <label style={label}>
            Start hour
            <select className="sb-input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (
                <option key={h} value={h}>
                  {formatHourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Minute
            <select className="sb-input" value={minute} onChange={(e) => setMinute(Number(e.target.value))}>
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  :{m.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <label style={label}>
            Duration (min)
            <input
              className="sb-input"
              type="number"
              min={15}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
        </div>

        <label style={label}>
          Type
          <select
            className="sb-input"
            value={kind}
            onChange={(e) => {
              const meta = BLOCK_KINDS.find((k) => k.value === e.target.value);
              if (meta) setKind(meta.value);
            }}
          >
            {BLOCK_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label style={label}>
          Repeat
          <select
            className="sb-input"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as RecurrenceFrequency | "")}
          >
            {RECURRENCE_OPTIONS.map((opt) => (
              <option key={opt.value || "none"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {!editBlock && (
          <label style={label}>
            Task
            <select
              className="sb-input"
              value={taskLink}
              onChange={(e) => setTaskLink(e.target.value as "none" | "new" | string)}
            >
              <option value="none">No linked task</option>
              <option value="new">Create new task from title</option>
              {openTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  Link: {task.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={actions}>
          <PressableEnergy type="submit">{editBlock ? "Save changes" : "Save block"}</PressableEnergy>
          <PressableEnergy type="button" variant="ghost" onClick={onClose}>
            Cancel
          </PressableEnergy>
        </div>
      </form>
    </ModalBackdrop>
  );
}

const panel = { width: "min(420px, 92vw)" };
const heading = { margin: "0 0 4px", fontSize: "18px" };
const hint = { margin: "0 0 16px", color: "var(--sb-text-secondary)", fontSize: "13px" };
const form = { display: "flex", flexDirection: "column" as const, gap: "12px" };
const label = { display: "flex", flexDirection: "column" as const, gap: "6px", fontSize: "13px" };
const row = { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr", gap: "10px" };
const actions = { display: "flex", gap: "8px", marginTop: "8px" };
