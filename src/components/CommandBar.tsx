import { useEffect, useMemo, useRef, useState } from "react";
import { moveBlockAfterConflicts, replaceBlocks } from "@/lib/actions";
import {
  resolveCommand,
  runCommand,
  suggestCommands,
  type PendingConflict,
} from "@/lib/commands";

interface Feedback {
  text: string;
  ok: boolean;
}

/**
 * Vim-style command line docked to the bottom of the workspace. Collapsed it is
 * a single button; Ctrl+K or a click slides it open.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
  const preview = useMemo(() => {
    const resolved = resolveCommand(value);
    return resolved ? resolved.spec.preview(resolved.args) : null;
  }, [value]);

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

  async function resolveConflict(choice: "replace" | "move" | "cancel") {
    if (!pending) return;
    const { block, conflicts } = pending;
    setPending(null);

    if (choice === "cancel") {
      setFeedback({ text: "Cancelled", ok: false });
      return;
    }

    const outcome =
      choice === "replace"
        ? await replaceBlocks(conflicts, block)
        : await moveBlockAfterConflicts(block, conflicts);

    setFeedback({ text: outcome.message, ok: outcome.ok });
    if (outcome.ok) setValue("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (pending) {
      const key = event.key.toLowerCase();
      if (key === "r" || key === "m" || key === "c" || key === "escape") {
        event.preventDefault();
        resolveConflict(key === "r" ? "replace" : key === "m" ? "move" : "cancel");
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
      <div
        style={{
          ...panel,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(16px)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {pending ? (
          <div style={conflictRow}>
            <span style={conflictText}>
              Conflicts with {pending.conflicts.map((c) => c.title).join(", ")}
            </span>
            <span style={conflictKeys}>
              <kbd style={kbd}>R</kbd>eplace <kbd style={kbd}>M</kbd>ove{" "}
              <kbd style={kbd}>C</kbd>ancel
            </span>
          </div>
        ) : (
          suggestions.length > 0 && (
            <div style={suggestionRow}>
              {suggestions.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  style={suggestionChip}
                  onClick={() => {
                    setValue(`${command.names[0]} `);
                    inputRef.current?.focus();
                  }}
                  title={command.summary}
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
            placeholder="timer 30 · block 1:30-2:30 focus Essay · done essay · go schedule"
            spellCheck={false}
            aria-label="Command input"
          />
          <button type="button" style={closeBtn} onClick={collapse} title="Close (Esc)">
            ×
          </button>
        </div>

        {(preview || feedback) && !pending && (
          <p
            style={{
              ...hint,
              color: feedback
                ? feedback.ok
                  ? "var(--sb-accent)"
                  : "#ffaaaa"
                : "var(--sb-text-muted)",
            }}
          >
            {feedback?.text ?? preview}
          </p>
        )}
      </div>

      <button
        type="button"
        style={{ ...launcher, opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto" }}
        onClick={() => setOpen(true)}
        title="Command bar (Ctrl+K)"
      >
        <span style={launcherGlyph}>›_</span>
      </button>
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
  gap: "8px",
  zIndex: 90,
};

const panel = {
  width: "min(720px, 92vw)",
  padding: "10px 12px",
  borderRadius: "var(--sb-radius-md)",
  background: "var(--sb-bg-hud, var(--sb-bg-overlay))",
  border: "1px solid var(--sb-border-glow)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 18px var(--sb-glow-accent)",
  backdropFilter: "blur(12px)",
  transition: "opacity 180ms ease, transform 180ms ease",
};

const inputRow = { display: "flex", alignItems: "center", gap: "8px" };

const prompt = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "16px",
  color: "var(--sb-accent)",
};

const input = {
  flex: 1,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--sb-text-primary)",
  fontFamily: "var(--sb-font-mono)",
  fontSize: "14px",
  padding: "6px 0",
};

const closeBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  fontSize: "18px",
  lineHeight: 1,
};

const suggestionRow = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap" as const,
  marginBottom: "8px",
};

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

const conflictRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "8px",
  flexWrap: "wrap" as const,
};

const conflictText = { fontSize: "12px", color: "#ffcc88" };
const conflictKeys = { fontSize: "12px", color: "var(--sb-text-secondary)" };
const kbd = {
  padding: "1px 5px",
  borderRadius: "4px",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-accent)",
  fontFamily: "var(--sb-font-mono)",
  fontSize: "11px",
};

const hint = {
  margin: "6px 0 0",
  fontSize: "12px",
  fontFamily: "var(--sb-font-mono)",
};

const launcher = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  border: "1px solid var(--sb-border-glow)",
  background: "var(--sb-bg-overlay)",
  color: "var(--sb-accent)",
  cursor: "pointer",
  boxShadow: "0 0 16px var(--sb-glow-accent)",
  transition: "opacity 180ms ease",
  alignSelf: "flex-end",
  marginRight: "var(--sb-space-lg)",
};

const launcherGlyph = { fontFamily: "var(--sb-font-mono)", fontSize: "16px", fontWeight: 700 };
