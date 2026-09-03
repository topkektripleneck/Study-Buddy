import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { useTimer } from "@/hooks/useTimer";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { api } from "@/lib/api";
import {
  ackTimerSuspend,
  confirmTimerRestore,
  discardTimerRestore,
  pauseTimer,
  resetTimer,
  resumeTimer,
  setHud,
  skipPhase,
  startFocus,
  startStopwatch,
} from "@/lib/actions";
import { formatPhase } from "@/lib/format";
import { breakPlanFor } from "@/lib/breaks";
import { formatTimerMs } from "@/lib/timerStore";
import { GlowBorder, KineticStack, PressableEnergy, Surface } from "@/ui/kit";
import type { TimerRestoreOffer } from "@/types";

const FOCUS_PRESETS = [15, 25, 50];

export function FocusWidget() {
  const { displayTime, isRunning, isPaused, isIdle, tick } = useTimer();
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [restoreOffer, setRestoreOffer] = useState<TimerRestoreOffer | null>(null);
  const { open: hudOpen } = useWindowOpen("hud");

  const refreshFocusMinutes = useCallback(() => {
    api.configGet().then((c) => setFocusMinutes(c.pomodoroFocusMinutes));
  }, []);

  const refreshRestoreOffer = useCallback(() => {
    api.timerGetPendingRestore().then(setRestoreOffer);
  }, []);

  useEffect(() => {
    refreshFocusMinutes();
    refreshRestoreOffer();
  }, [refreshFocusMinutes, refreshRestoreOffer]);

  useListen(refreshFocusMinutes, "config:changed");
  useListen(refreshRestoreOffer, "timer:restore-pending");

  const phase = tick?.phase ?? "idle";
  const isBreak = phase === "short_break" || phase === "long_break";
  const breakMinutes = Math.round((tick?.phaseDurationMs ?? 0) / 60_000);
  const plan = isBreak ? breakPlanFor(breakMinutes) : null;
  const idlePreview = `${String(focusMinutes).padStart(2, "0")}:00`;
  const suspendGapMs = tick?.suspendGapMs ?? null;

  async function handleConfirmRestore() {
    await confirmTimerRestore();
    setRestoreOffer(null);
  }

  async function handleDiscardRestore() {
    await discardTimerRestore();
    setRestoreOffer(null);
  }

  return (
    <GlowBorder active={isRunning} tone="accent">
      <Surface padding="lg" variant="overlay">
        <KineticStack gap="md" align="center">
          {restoreOffer && isIdle && (
            <div style={noticePanel}>
              <p style={noticeText}>
                Resume {formatPhase(restoreOffer.phase)} session?
                {restoreOffer.remainingMs != null
                  ? ` (${formatTimerMs(restoreOffer.remainingMs)} left)`
                  : ` (${formatTimerMs(restoreOffer.elapsedMs)} elapsed)`}
              </p>
              <KineticStack direction="row" gap="sm">
                <PressableEnergy onClick={handleConfirmRestore}>Resume</PressableEnergy>
                <PressableEnergy variant="ghost" onClick={handleDiscardRestore}>
                  Discard
                </PressableEnergy>
              </KineticStack>
            </div>
          )}

          {suspendGapMs != null && suspendGapMs > 0 && (
            <div style={noticePanel}>
              <p style={noticeText}>
                System was asleep for {Math.max(1, Math.round(suspendGapMs / 60_000))} min — timer
                paused
              </p>
              <PressableEnergy onClick={() => ackTimerSuspend()}>Continue</PressableEnergy>
            </div>
          )}

          <p style={phaseLabel}>{formatPhase(phase)}</p>
          <p style={timerDisplay}>{isIdle && !restoreOffer ? idlePreview : displayTime}</p>

          {isIdle && (
            <KineticStack direction="row" gap="sm">
              {FOCUS_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="sb-pressable sb-pressable-hover"
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
            className="sb-pressable sb-pressable-hover"
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
const noticePanel = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-raised)",
  border: "1px solid var(--sb-border-glow)",
  fontSize: "12px",
};
const noticeText = { margin: "0 0 8px", color: "var(--sb-text-secondary)" };
const linkBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  textDecoration: "underline",
};
