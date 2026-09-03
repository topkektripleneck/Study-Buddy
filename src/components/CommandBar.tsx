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
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const suggestions = useMemo(() => suggestCommands(value).slice(0, 5), [value]);
  const hint = useMemo(() => resolveCommand(value)?.spec.summary ?? null, [value]);
  const showExtras = open && (pending || suggestions.length > 0 || feedback || hint);

  function collapse() {
    setOpen(false);
    setPending(null);
    setValue("");
    setFeedback(null);
    inputRef.current?.blur();
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
    <div className="sb-command-dock">
      {showExtras && (
        <div className="sb-glass sb-command-panel" style={extras}>
          {pending ? (
            <p className="sb-warn-banner">
              Conflicts with {pending.conflicts.map((c) => c.title).join(", ")} —{" "}
              <kbd>R</kbd> replace · <kbd>M</kbd> move · <kbd>C</kbd> cancel
            </p>
          ) : (
            <>
              {suggestions.length > 0 && (
                <div style={suggestionRow}>
                  {suggestions.map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      className="sb-pressable sb-pressable-hover"
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
              )}
              {(feedback || hint) && (
                <p
                  style={{
                    ...hintStyle,
                    color: feedback
                      ? feedback.ok
                        ? "var(--sb-accent)"
                        : "var(--sb-error)"
                      : "var(--sb-text-muted)",
                  }}
                >
                  {feedback?.text ?? hint}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className={`sb-glass sb-command-bar${open ? " sb-command-bar-active" : ""}`} style={bar}>
        <div style={inputRow}>
          <span style={prompt}>:</span>
          <input
            ref={inputRef}
            style={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Ctrl+K · timer 30 · block 1:30-2:30 focus · go schedule"
            spellCheck={false}
            aria-label="Command input"
          />
          <span style={shortcut}>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}

const extras = {
  padding: "10px var(--sb-space-lg)",
  borderBottom: "1px solid var(--sb-border-subtle)",
};

const bar = {
  padding: "12px var(--sb-space-lg)",
};

const inputRow = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  maxWidth: "1200px",
  margin: "0 auto",
};

const prompt = { fontFamily: "var(--sb-font-mono)", fontSize: "16px", color: "var(--sb-accent)" };
const input = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--sb-text-primary)",
  fontFamily: "var(--sb-font-mono)",
  fontSize: "14px",
  minWidth: 0,
};
const shortcut = {
  fontSize: "11px",
  color: "var(--sb-text-muted)",
  fontFamily: "var(--sb-font-mono)",
  letterSpacing: "0.04em",
  flexShrink: 0,
};
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
const hintStyle = { margin: 0, fontSize: "12px", fontFamily: "var(--sb-font-mono)" };
