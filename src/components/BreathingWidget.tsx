import { useEffect, useState } from "react";
import { PressableEnergy, Surface } from "@/ui/kit";

const PATTERNS = {
  box: {
    label: "Box 4-4-4-4",
    phases: [
      { label: "Inhale", secs: 4, scale: 1 },
      { label: "Hold", secs: 4, scale: 1 },
      { label: "Exhale", secs: 4, scale: 0.45 },
      { label: "Hold", secs: 4, scale: 0.45 },
    ],
  },
  relax: {
    label: "Relax 4-7-8",
    phases: [
      { label: "Inhale", secs: 4, scale: 1 },
      { label: "Hold", secs: 7, scale: 1 },
      { label: "Exhale", secs: 8, scale: 0.45 },
    ],
  },
} as const;

type PatternKey = keyof typeof PATTERNS;

const PATTERN_KEYS: PatternKey[] = ["box", "relax"];

export function BreathingWidget() {
  const [patternKey, setPatternKey] = useState<PatternKey>("box");
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(PATTERNS.box.phases[0].secs);
  const [cycles, setCycles] = useState(0);

  const phases = PATTERNS[patternKey].phases;
  const phase = phases[phaseIndex];

  useEffect(() => {
    if (!running) return;
    if (secondsLeft <= 0) {
      const next = (phaseIndex + 1) % phases.length;
      if (next === 0) setCycles((c) => c + 1);
      setPhaseIndex(next);
      setSecondsLeft(phases[next].secs);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [running, secondsLeft, phaseIndex, phases]);

  function selectPattern(key: PatternKey) {
    setPatternKey(key);
    setPhaseIndex(0);
    setSecondsLeft(PATTERNS[key].phases[0].secs);
    setRunning(false);
  }

  function stop() {
    setRunning(false);
    setPhaseIndex(0);
    setSecondsLeft(phases[0].secs);
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Breathe</h3>

      <div style={tabs}>
        {PATTERN_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="sb-pressable"
            style={{ ...tab, ...(key === patternKey ? tabActive : null) }}
            onClick={() => selectPattern(key)}
            aria-pressed={key === patternKey}
          >
            {PATTERNS[key].label}
          </button>
        ))}
      </div>

      <div style={stage}>
        <div
          style={{
            ...orb,
            transform: `scale(${running ? phase.scale : 0.45})`,
            transitionDuration: `${running ? phase.secs : 1}s`,
          }}
        />
        <div style={readout}>
          <span style={phaseLabel} role="status" aria-live="polite">
            {running ? phase.label : "Ready"}
          </span>
          <span style={count} aria-hidden="true">
            {running ? secondsLeft : phases[0].secs}
          </span>
        </div>
      </div>

      <div style={controls}>
        <PressableEnergy onClick={() => (running ? stop() : setRunning(true))}>
          {running ? "Stop" : "Start"}
        </PressableEnergy>
        <span style={meta}>{cycles} cycles</span>
      </div>
    </Surface>
  );
}

const title = { margin: "0 0 12px", fontSize: "16px" };
const tabs = { display: "flex", gap: "6px", marginBottom: "12px" };
const tab = {
  flex: 1,
  padding: "6px 8px",
  fontSize: "11px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-secondary)",
};
const tabActive = {
  borderColor: "var(--sb-border-glow)",
  color: "var(--sb-text-primary)",
  boxShadow: "0 0 12px var(--sb-glow-accent)",
};
const stage = {
  position: "relative" as const,
  height: "150px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const orb = {
  width: "130px",
  height: "130px",
  borderRadius: "50%",
  background: "radial-gradient(circle at 35% 30%, var(--sb-accent-dim), transparent 70%)",
  border: "1px solid var(--sb-border-glow)",
  boxShadow: "0 0 32px var(--sb-glow-accent)",
  transitionProperty: "transform",
  transitionTimingFunction: "linear",
};
const readout = {
  position: "absolute" as const,
  inset: 0,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none" as const,
};
const phaseLabel = {
  fontSize: "13px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--sb-text-secondary)",
};
const count = { fontSize: "28px", fontWeight: 600, color: "var(--sb-text-primary)" };
const controls = { display: "flex", alignItems: "center", gap: "12px", marginTop: "12px" };
const meta = { fontSize: "12px", color: "var(--sb-text-muted)" };
