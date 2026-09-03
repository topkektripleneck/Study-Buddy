import { useEffect, useRef, useState } from "react";
import { PressableEnergy, Surface } from "@/ui/kit";

/** Ephemeral venting — text never crosses IPC or touches disk. */
export function VentWidget() {
  const bufferRef = useRef<Uint8Array | null>(new Uint8Array(0));
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [charCount, setCharCount] = useState(0);
  const [burned, setBurned] = useState(false);

  useEffect(() => {
    return () => shred();
  }, []);

  function shred() {
    const buf = bufferRef.current;
    if (buf && buf.length > 0) {
      crypto.getRandomValues(buf);
      crypto.getRandomValues(buf);
      buf.fill(0);
    }
    bufferRef.current = null;
    if (areaRef.current) {
      areaRef.current.value = "";
      areaRef.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setCharCount(0);
    setBurned(true);
    window.setTimeout(() => setBurned(false), 2000);
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Vent Corner</h3>
      <p style={hint}>
        Type freely. Nothing here is saved — burn when done. Not forensic-grade erasure, but nothing
        persists.
      </p>
      <textarea
        ref={areaRef}
        className="sb-input"
        style={area}
        defaultValue=""
        placeholder="Let it out…"
        rows={4}
        onInput={() => {
          const text = areaRef.current?.value ?? "";
          bufferRef.current = new TextEncoder().encode(text);
          setCharCount(bufferRef.current.length);
        }}
      />
      <div style={row}>
        <span style={meta}>{charCount} bytes in memory</span>
        <PressableEnergy onClick={shred}>Burn</PressableEnergy>
      </div>
      {burned && <p style={ok}>Shredded.</p>}
    </Surface>
  );
}

const title = { margin: "0 0 4px", fontSize: "16px" };
const hint = { margin: "0 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
const area = { width: "100%", marginBottom: "8px", resize: "vertical" as const };
const row = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const meta = { fontSize: "11px", color: "var(--sb-text-muted)" };
const ok = { margin: "8px 0 0", fontSize: "12px", color: "var(--sb-accent)" };
