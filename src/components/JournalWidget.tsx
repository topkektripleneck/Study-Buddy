import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { api } from "@/lib/api";
import { PressableEnergy, Surface } from "@/ui/kit";
import type { JournalEntry } from "@/types";

export function JournalWidget() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshEntries = useCallback(async () => {
    try {
      setEntries(await api.journalList());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useListen(refreshEntries, "journal:changed");

  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  async function save() {
    const text = draft.trim();
    if (!text) return;
    try {
      await api.journalSave(text);
      setDraft("");
      await refreshEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  if (loading) {
    return (
      <Surface padding="md">
        <p style={hint}>Loading journal…</p>
      </Surface>
    );
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Journal</h3>
      {error && <p style={errorText}>{error}</p>}
      <textarea
        className="sb-input"
        style={area}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Today's entry…"
        spellCheck
        rows={3}
      />
      <PressableEnergy onClick={save} disabled={!draft.trim()}>
        Save entry
      </PressableEnergy>
      <ol style={timeline}>
        {entries.map((entry) => (
          <li key={entry.id} style={item}>
            <time style={time} dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
            <p style={body}>{entry.text}</p>
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={removeBtn}
              aria-label="Delete entry"
              onClick={() => api.journalDelete(entry.id).then(refreshEntries)}
            >
              Delete
            </button>
          </li>
        ))}
        {entries.length === 0 && <li style={empty}>No entries yet.</li>}
      </ol>
    </Surface>
  );
}

const title = { margin: "0 0 8px", fontSize: "16px" };
const hint = { margin: 0, fontSize: "12px", color: "var(--sb-text-muted)" };
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "var(--sb-error)" };
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
const item = { paddingLeft: "12px", borderLeft: "2px solid var(--sb-border-glow)" };
const time = { fontSize: "11px", color: "var(--sb-text-muted)" };
const body = { margin: "4px 0", fontSize: "13px", lineHeight: 1.45, whiteSpace: "pre-wrap" as const };
const removeBtn = {
  fontSize: "11px",
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
};
const empty = { fontSize: "12px", color: "var(--sb-text-muted)", listStyle: "none" };
