import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { api } from "@/lib/api";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { JournalEntry } from "@/types";

export function JournalWidget() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEntries(await api.journalList());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load journal");
    }
  }, []);

  useListen(refresh, "journal:changed");

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    const text = draft.trim();
    if (!text) return;
    try {
      await api.journalAdd(text);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save entry");
    }
  }

  async function remove(id: string) {
    try {
      await api.journalDelete(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete entry");
    }
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Mini-Journal</h3>
      <p style={hint}>Scratch thoughts, vent, or reflect — saved locally on your timeline.</p>
      {error && <p style={errorText}>{error}</p>}

      <textarea
        className="sb-input"
        style={area}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What's on your mind?"
        spellCheck
        rows={3}
      />
      <PressableEnergy onClick={save} disabled={!draft.trim()}>
        Add entry
      </PressableEnergy>

      <ol style={timeline}>
        {entries.map((entry) => (
          <li key={entry.id} style={item}>
            <div style={itemHead}>
              <time style={time} dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              <button type="button" className="sb-pressable" style={removeBtn} onClick={() => remove(entry.id)}>
                ×
              </button>
            </div>
            <p style={body}>{entry.text}</p>
          </li>
        ))}
        {entries.length === 0 && <li style={empty}>No entries yet.</li>}
      </ol>
    </Surface>
  );
}

const title = { margin: "0 0 4px", fontSize: "16px" };
const hint = { margin: "0 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "#ffaaaa" };
const area = { width: "100%", marginBottom: "8px", minHeight: "72px", resize: "vertical" as const };
const timeline = {
  listStyle: "none",
  margin: "12px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
  maxHeight: "220px",
  overflowY: "auto" as const,
};
const item = {
  paddingLeft: "12px",
  borderLeft: "2px solid var(--sb-border-glow)",
};
const itemHead = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" };
const time = { fontSize: "11px", color: "var(--sb-text-muted)" };
const removeBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
};
const body = { margin: "4px 0 0", fontSize: "13px", lineHeight: 1.45, whiteSpace: "pre-wrap" as const };
const empty = { fontSize: "12px", color: "var(--sb-text-muted)", listStyle: "none" };
