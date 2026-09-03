import { useEffect, useRef, useState } from "react";
import { formatTimerMs } from "@/lib/timerStore";
import { PressableEnergy, Surface } from "@/ui/kit";

const PATTERNS = {
  box: {
    label: "Box",
    hint: "4-4-4-4",
    phases: [
      { label: "Inhale", secs: 4, scale: 1.08 },
      { label: "Hold", secs: 4, scale: 1.08 },
      { label: "Exhale", secs: 4, scale: 0.64 },
      { label: "Hold", secs: 4, scale: 0.64 },
    ],
  },
  relax: {
    label: "Relax",
    hint: "4-7-8",
    phases: [
      { label: "Inhale", secs: 4, scale: 1.08 },
      { label: "Hold", secs: 7, scale: 1.08 },
      { label: "Exhale", secs: 8, scale: 0.64 },
    ],
  },
  energize: {
    label: "Awake",
    hint: "2-2",
    phases: [
      { label: "Inhale", secs: 2, scale: 1.08 },
      { label: "Exhale", secs: 2, scale: 0.64 },
    ],
  },
} as const;

type PatternKey = keyof typeof PATTERNS;

const PATTERN_KEYS: PatternKey[] = ["box", "relax", "energize"];

export function BreathingWidget() {
  const [patternKey, setPatternKey] = useState<PatternKey>("box");
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(PATTERNS.box.phases[0].secs);
  const [cycles, setCycles] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const pattern = PATTERNS[patternKey];
  const phases = pattern.phases;
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

  useEffect(() => {
    if (!running || startedAtRef.current == null) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - (startedAtRef.current ?? Date.now()));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  function resetSession() {
    setPhaseIndex(0);
    setSecondsLeft(phases[0].secs);
    setCycles(0);
    setElapsedMs(0);
    startedAtRef.current = null;
  }

  function selectPattern(key: PatternKey) {
    setRunning(false);
    setPatternKey(key);
    setPhaseIndex(0);
    setCycles(0);
    setElapsedMs(0);
    startedAtRef.current = null;
    setSecondsLeft(PATTERNS[key].phases[0].secs);
  }

  function start() {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    resetSession();
  }

  const displayPhase = running ? phase.label : "Ready";
  const displayCount = running ? secondsLeft : phases[0].secs;

  return (
    <Surface padding="md" className="sb-breathe-widget">
      <div style={headerRow}>
        <h3 style={title}>Breathe</h3>
        <span style={activeHint}>{pattern.label} · {pattern.hint}</span>
      </div>

      <div style={segmentedTrack} role="tablist" aria-label="Breathing pattern">
        {PATTERN_KEYS.map((key) => {
          const meta = PATTERNS[key];
          const active = key === patternKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className="sb-pressable sb-pressable-hover"
              style={{ ...segmentTab, ...(active ? segmentTabActive : null) }}
              onClick={() => selectPattern(key)}
              aria-selected={active}
            >
              <span style={tabName}>{meta.label}</span>
              <span style={tabCadence}>{meta.hint}</span>
            </button>
          );
        })}
      </div>

      <div style={phaseTrack} aria-label="Pattern phases">
        {phases.map((step, index) => {
          const active = running && index === phaseIndex;
          const done = running && index < phaseIndex;
          return (
            <div
              key={`${patternKey}-${step.label}-${index}`}
              style={{
                ...phaseStep,
                ...(active ? phaseStepActive : null),
                ...(done ? phaseStepDone : null),
              }}
            >
              <span style={stepLabel}>{step.label}</span>
              <span style={stepDuration}>{step.secs}s</span>
            </div>
          );
        })}
      </div>

      <div style={stage}>
        <div className="sb-breathe-guide-ring" aria-hidden="true" />
        <div
          className={`sb-breathe-orb ${!running ? "sb-breathe-orb--idle" : ""}`}
          style={{
            transform: `scale(${running ? phase.scale : 0.74})`,
            transitionDuration: `${running ? phase.secs : 0.8}s`,
          }}
        />
        <div style={readout}>
          <span style={phaseLabel} role="status" aria-live="polite">
            {displayPhase}
          </span>
          <span style={count} aria-hidden="true">
            {displayCount}
          </span>
        </div>
      </div>

      <div style={statsRow}>
        <div style={stat}>
          <span style={statLabel}>Elapsed</span>
          <span style={statValue}>{formatTimerMs(elapsedMs)}</span>
        </div>
        <div style={statDivider} aria-hidden="true" />
        <div style={stat}>
          <span style={statLabel}>Cycles</span>
          <span style={statValue}>{cycles}</span>
        </div>
      </div>

      <div style={controls}>
        {running ? (
          <div style={buttonGroup}>
            <PressableEnergy style={primaryButton} onClick={stop}>
              End Session
            </PressableEnergy>
            <PressableEnergy variant="ghost" onClick={resetSession} title="Reset cycles">
              Reset
            </PressableEnergy>
          </div>
        ) : (
          <PressableEnergy style={fullButton} onClick={start}>
            Begin Breathing
          </PressableEnergy>
        )}
      </div>
    </Surface>
  );
}

const headerRow = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  margin: "0 0 10px",
};

const title = {
  margin: 0,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.02em",
};

const activeHint = {
  fontSize: "11px",
  fontFamily: "var(--sb-font-mono)",
  color: "var(--sb-accent)",
  opacity: 0.85,
};

const segmentedTrack = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "4px",
  padding: "3px",
  borderRadius: "9999px",
  background: "rgba(0, 0, 0, 0.28)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  marginBottom: "10px",
};

const segmentTab = {
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "baseline",
  justifyContent: "center",
  gap: "5px",
  padding: "6px 8px",
  borderRadius: "9999px",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  transition: "all 0.18s ease",
};

const segmentTabActive = {
  background: "color-mix(in srgb, var(--sb-accent) 22%, rgba(255, 255, 255, 0.08))",
  borderColor: "color-mix(in srgb, var(--sb-border-glow) 70%, rgba(255, 255, 255, 0.15))",
  color: "var(--sb-text-primary)",
  boxShadow: "0 2px 10px var(--sb-glow-accent)",
};

const tabName = {
  fontSize: "12px",
  fontWeight: 600,
};

const tabCadence = {
  fontSize: "10px",
  fontFamily: "var(--sb-font-mono)",
  opacity: 0.7,
};

const phaseTrack = {
  display: "flex",
  gap: "4px",
  marginBottom: "8px",
  height: "26px",
};

const phaseStep = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  padding: "0 4px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(0, 0, 0, 0.18)",
  border: "1px solid rgba(255, 255, 255, 0.04)",
  color: "var(--sb-text-muted)",
  transition: "all 0.25s ease",
};

const phaseStepActive = {
  background: "color-mix(in srgb, var(--sb-accent) 26%, rgba(255, 255, 255, 0.05))",
  borderColor: "var(--sb-border-glow)",
  color: "var(--sb-text-primary)",
  boxShadow: "0 0 12px var(--sb-glow-accent)",
};

const phaseStepDone = {
  background: "rgba(255, 255, 255, 0.06)",
  color: "var(--sb-text-secondary)",
};

const stepLabel = {
  fontSize: "10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

const stepDuration = {
  fontSize: "10px",
  fontFamily: "var(--sb-font-mono)",
  opacity: 0.8,
};

const stage = {
  position: "relative" as const,
  height: "172px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "6px 0 10px",
};

const readout = {
  position: "absolute" as const,
  inset: 0,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  pointerEvents: "none" as const,
};

const phaseLabel = {
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontWeight: 600,
  color: "var(--sb-text-secondary)",
  lineHeight: 1.2,
  textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
};

const count = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "36px",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "var(--sb-text-primary)",
  lineHeight: 1,
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
};

const statsRow = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
  padding: "8px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "rgba(0, 0, 0, 0.22)",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const stat = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: "2px",
};

const statLabel = {
  fontSize: "10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--sb-text-muted)",
};

const statValue = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "16px",
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: "var(--sb-accent)",
  lineHeight: 1.1,
};

const statDivider = {
  width: "1px",
  height: "22px",
  background: "rgba(255, 255, 255, 0.08)",
};

const controls = {
  display: "flex",
  justifyContent: "center",
};

const buttonGroup = {
  display: "flex",
  gap: "8px",
  width: "100%",
};

const primaryButton = {
  flex: 1,
  justifyContent: "center",
};

const fullButton = {
  width: "100%",
  justifyContent: "center",
  padding: "9px 16px",
};
