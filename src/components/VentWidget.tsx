import { useEffect, useRef, useState } from "react";
import { PressableEnergy, Surface } from "@/ui/kit";

/** Printable-ASCII noise. Chunked because getRandomValues rejects >64KiB. */
function randomJunk(length: number): string {
  const MAX = 65_536;
  let out = "";
  for (let done = 0; done < length; done += MAX) {
    const bytes = new Uint8Array(Math.min(MAX, length - done));
    crypto.getRandomValues(bytes);
    out += Array.from(bytes, (b) => String.fromCharCode(33 + (b % 94))).join("");
  }
  return out;
}

export function VentWidget() {
  const [text, setText] = useState("");
  const [burning, setBurning] = useState(false);
  const timeout = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) window.clearTimeout(timeout.current);
    },
    [],
  );

  function burn() {
    if (!text || burning) return;
    setBurning(true);
    // ponytail: strings are immutable — noise overwrite is visual only until GC.
    setText(randomJunk(text.length));
    timeout.current = window.setTimeout(() => {
      setText("");
      setBurning(false);
    }, 420);
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Venting Corner</h3>
      <p style={hint}>Never written to disk. Leaving this view clears it too.</p>
      <textarea
        style={{
          ...area,
          opacity: burning ? 0 : 1,
          filter: burning ? "blur(6px)" : "none",
          transform: burning ? "translateY(-8px)" : "none",
        }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Dump it here, then burn it."
        spellCheck={false}
        readOnly={burning}
        aria-label="Ephemeral vent text"
      />
      <div style={controls}>
        <span style={meta}>{text.length} chars</span>
        <PressableEnergy onClick={burn} disabled={!text || burning}>
          {burning ? "Burning…" : "Burn"}
        </PressableEnergy>
      </div>
    </Surface>
  );
}

const title = { margin: "0 0 4px", fontSize: "16px" };
const hint = { margin: "0 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
const area = {
  width: "100%",
  minHeight: "120px",
  resize: "vertical" as const,
  padding: "10px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  font: "inherit",
  transition: "opacity 400ms var(--sb-ease-out), filter 400ms linear, transform 400ms var(--sb-ease-out)",
};
const controls = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: "12px",
};
const meta = { fontSize: "12px", color: "var(--sb-text-muted)" };
