import { useEffect, useState } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { api } from "@/lib/api";
import {
  pauseTimer,
  resetTimer,
  resumeTimer,
  setHud,
  skipPhase,
  startFocus,
  startStopwatch,
} from "@/lib/actions";
import { breakPlanFor } from "@/lib/breaks";
import { GlowBorder, KineticStack, PressableEnergy, Surface } from "@/ui/kit";

const FOCUS_PRESETS = [15, 25, 50];

export function FocusWidget() {
  const { displayTime, isRunning, isPaused, isIdle, tick } = useTimer();
  const [focusMinutes, setFocusMinutes] = useState(25);
  const { open: hudOpen } = useWindowOpen("hud");

  useEffect(() => {
    api.configGet().then((c) => setFocusMinutes(c.pomodoroFocusMinutes));
  }, []);

  const phase = tick?.phase ?? "idle";
  const isBreak = phase === "short_break" || phase === "long_break";
  const breakMinutes = Math.round((tick?.phaseDurationMs ?? 0) / 60_000);
  const plan = isBreak ? breakPlanFor(breakMinutes) : null;

  return (
    <GlowBorder active={isRunning} tone="accent">
      <Surface padding="lg" variant="overlay">
        <KineticStack gap="md" align="center">
          <p style={phaseLabel}>{phase.replace("_", " ")}</p>
          <p style={timerDisplay}>{displayTime}</p>

          {isIdle && (
            <KineticStack direction="row" gap="sm">
              {FOCUS_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  style={{ ...chip, ...(focusMinutes === m ? chipActive : {}) }}
                  onClick={() => setFocusMinutes(m)}
                >
                  {m}m
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={240}
                value={focusMinutes}
                onChange={(e) =>
                  setFocusMinutes(Math.min(240, Math.max(1, Number(e.target.value) || 1)))
                }
                className="sb-input sb-input-narrow"
                aria-label="Focus minutes"
              />
            </KineticStack>
          )}

          <KineticStack direction="row" gap="sm">
            {isIdle && (
              <>
                <PressableEnergy onClick={() => startFocus(focusMinutes)}>
                  Start {focusMinutes}m focus
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => startStopwatch()}>
                  Stopwatch
                </PressableEnergy>
              </>
            )}
            {isRunning && <PressableEnergy onClick={() => pauseTimer()}>Pause</PressableEnergy>}
            {isPaused && <PressableEnergy onClick={() => resumeTimer()}>Resume</PressableEnergy>}
            {!isIdle && phase !== "stopwatch" && (
              <PressableEnergy variant="ghost" onClick={() => skipPhase()}>
                Skip
              </PressableEnergy>
            )}
            {!isIdle && (
              <PressableEnergy variant="ghost" onClick={() => resetTimer()}>
                Reset
              </PressableEnergy>
            )}
          </KineticStack>

          {plan && (
            <div style={breakPanel}>
              <p style={breakHeadline}>
                {plan.headline} · {breakMinutes} min
              </p>
              <ul style={breakList}>
                {plan.suggestions.map((s) => (
                  <li key={s.label} style={breakItem}>
                    <strong>{s.label}</strong> — {s.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            className="sb-pressable"
            style={linkBtn}
            onClick={() => (hudOpen ? setHud(false) : setHud(true))}
          >
            {hudOpen ? "Hide HUD" : "Show HUD"}
          </button>
        </KineticStack>
      </Surface>
    </GlowBorder>
  );
}

const phaseLabel = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};
const timerDisplay = {
  margin: 0,
  fontFamily: "var(--sb-font-mono)",
  fontSize: "48px",
  fontWeight: 700,
  color: "var(--sb-accent)",
};
const chip = {
  padding: "4px 12px",
  borderRadius: "999px",
  border: "1px solid var(--sb-border-subtle)",
  background: "transparent",
  color: "var(--sb-text-secondary)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
};
const chipActive = {
  borderColor: "var(--sb-border-glow)",
  color: "var(--sb-accent)",
  background: "var(--sb-bg-overlay)",
};
const breakPanel = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-raised)",
  border: "1px solid var(--sb-border-subtle)",
  fontSize: "12px",
};
const breakHeadline = { margin: "0 0 8px", color: "var(--sb-text-secondary)" };
const breakList = { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "4px" };
const breakItem = { color: "var(--sb-text-muted)" };
const linkBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  textDecoration: "underline",
};
