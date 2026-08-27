import { useEffect, useMemo, useRef, useState } from "react";
import { resolveBlockConflict } from "@/lib/actions";
import { resolveCommand, runCommand, suggestCommands, type PendingConflict } from "@/lib/commands";

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<PendingConflict | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const suggestions = useMemo(() => suggestCommands(value).slice(0, 5), [value]);
  const hint = useMemo(() => resolveCommand(value)?.spec.summary ?? null, [value]);

  function collapse() {
    setOpen(false);
    setPending(null);
    setValue("");
  }

  async function submit() {
    const input = value.trim();
    if (!input) return;
    const outcome = await runCommand(input);
    setHistory((prev) => [input, ...prev.filter((item) => item !== input)].slice(0, 40));
    setHistoryIndex(-1);
    if (outcome.pending) {
      setPending(outcome.pending);
      setFeedback({ text: outcome.message, ok: false });
      return;
    }
    setFeedback({ text: outcome.message, ok: outcome.ok });
    if (outcome.ok) setValue("");
  }

  async function onConflictKey(key: string) {
    if (!pending) return;
    const choice = key === "r" ? "replace" : key === "m" ? "move" : "cancel";
    const outcome = await resolveBlockConflict(choice, pending.block, pending.conflicts);
    setPending(null);
    if (!outcome) {
      setFeedback({ text: "Cancelled", ok: false });
      return;
    }
    setFeedback({ text: outcome.message, ok: outcome.ok });
    if (outcome.ok) setValue("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (pending) {
      const key = event.key.toLowerCase();
      if (key === "r" || key === "m" || key === "c" || key === "escape") {
        event.preventDefault();
        onConflictKey(key === "escape" ? "c" : key);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      collapse();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Tab" && suggestions.length > 0) {
      event.preventDefault();
      setValue(`${suggestions[0].names[0]} `);
      return;
    }
    if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setValue(history[next]);
      return;
    }
    if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setValue(next < 0 ? "" : history[next]);
    }
  }

  return (
    <div style={dock}>
      {open && (
        <div className="sb-glass sb-command-panel" style={panel}>
          {pending ? (
            <p style={conflictLine}>
              Conflicts with {pending.conflicts.map((c) => c.title).join(", ")} —{" "}
              <kbd>R</kbd> replace · <kbd>M</kbd> move · <kbd>C</kbd> cancel
            </p>
          ) : (
            suggestions.length > 0 && (
              <div style={suggestionRow}>
                {suggestions.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    className="sb-pressable"
                    style={suggestionChip}
                    onClick={() => {
                      setValue(`${command.names[0]} `);
                      inputRef.current?.focus();
                    }}
                  >
                    {command.usage}
                  </button>
                ))}
              </div>
            )
          )}

          <div style={inputRow}>
            <span style={prompt}>:</span>
            <input
              ref={inputRef}
              style={input}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="timer 30 · block 1:30-2:30 focus Essay · go schedule"
              spellCheck={false}
              aria-label="Command input"
            />
            <button
              type="button"
              className="sb-pressable"
              style={closeBtn}
              onClick={collapse}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>

          {(feedback || hint) && !pending && (
            <p
              style={{
                ...hintStyle,
                color: feedback
                  ? feedback.ok
                    ? "var(--sb-accent)"
                    : "#ffaaaa"
                  : "var(--sb-text-muted)",
              }}
            >
              {feedback?.text ?? hint}
            </p>
          )}
        </div>
      )}

      {!open && (
        <button
          type="button"
          className="sb-glass sb-pressable"
          style={launcher}
          onClick={() => setOpen(true)}
          title="Command bar (Ctrl+K)"
        >
          ›_
        </button>
      )}
    </div>
  );
}

const dock = {
  position: "fixed" as const,
  left: 0,
  right: 0,
  bottom: "var(--sb-space-md)",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  zIndex: 90,
};
const panel = {
  width: "min(720px, 92vw)",
  padding: "10px 12px",
  marginBottom: "8px",
  borderRadius: "var(--sb-radius-md)",
};
const inputRow = { display: "flex", alignItems: "center", gap: "8px" };
const prompt = { fontFamily: "var(--sb-font-mono)", fontSize: "16px", color: "var(--sb-accent)" };
const input = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--sb-text-primary)",
  fontFamily: "var(--sb-font-mono)",
  fontSize: "14px",
};
const closeBtn = { border: "none", background: "transparent", color: "var(--sb-text-muted)", cursor: "pointer", fontSize: "18px" };
const suggestionRow = { display: "flex", gap: "6px", flexWrap: "wrap" as const, marginBottom: "8px" };
const suggestionChip = {
  padding: "3px 8px",
  borderRadius: "999px",
  border: "1px solid var(--sb-border-subtle)",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "11px",
  fontFamily: "var(--sb-font-mono)",
};
const conflictLine = { margin: "0 0 8px", fontSize: "12px", color: "#ffcc88" };
const hintStyle = { margin: "6px 0 0", fontSize: "12px", fontFamily: "var(--sb-font-mono)" };
const launcher = {
  alignSelf: "flex-end" as const,
  marginRight: "var(--sb-space-lg)",
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  color: "var(--sb-accent)",
  fontFamily: "var(--sb-font-mono)",
  fontWeight: 700,
};
