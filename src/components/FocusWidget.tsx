import { useCallback, useEffect, useState } from "react";
import { useTimer } from "@/hooks/useTimer";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { api } from "@/lib/api";
import { breakPlanFor } from "@/lib/breaks";
import { openWindow } from "@/lib/windows";
import { GlowBorder, KineticStack, PressableEnergy, Surface } from "@/ui/kit";
import type { AppConfig } from "@/types";

const FOCUS_PRESETS = [15, 25, 50];

export function FocusWidget() {
  const { displayTime, isRunning, isPaused, isIdle, start, pause, resume, reset, skipPhase, tick } =
    useTimer();

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [showTuner, setShowTuner] = useState(false);
  const { open: hudOpen, toggle: toggleHud, setOpen: setHudOpen } = useWindowOpen("hud");

  useEffect(() => {
    let active = true;
    api.configGet().then((c) => {
      if (!active) return;
      setConfig(c);
      setFocusMinutes(c.pomodoroFocusMinutes);
    });
    return () => {
      active = false;
    };
  }, []);

  const patchConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const current = await api.configGet();
    const next = await api.configSave({ ...current, ...patch });
    setConfig(next);
    return next;
  }, []);

  async function handleStart(protocol: "pomodoro" | "stopwatch") {
    await start(protocol, protocol === "pomodoro" ? focusMinutes : undefined);
    const current = config ?? (await api.configGet());
    if (current.hudAutoShowOnSessionStart) {
      await openWindow("hud");
      setHudOpen(true);
    }
  }

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
                style={minutesInput}
                aria-label="Custom focus minutes"
              />
            </KineticStack>
          )}

          <KineticStack direction="row" gap="sm">
            {isIdle && (
              <>
                <PressableEnergy onClick={() => handleStart("pomodoro")}>
                  Start {focusMinutes}m focus
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => handleStart("stopwatch")}>
                  Stopwatch
                </PressableEnergy>
              </>
            )}
            {isRunning && <PressableEnergy onClick={() => pause()}>Pause</PressableEnergy>}
            {isPaused && <PressableEnergy onClick={() => resume()}>Resume</PressableEnergy>}
            {!isIdle && phase !== "stopwatch" && (
              <PressableEnergy variant="ghost" onClick={() => skipPhase()}>
                Skip
              </PressableEnergy>
            )}
            {!isIdle && (
              <PressableEnergy variant="ghost" onClick={() => reset()}>
                Reset
              </PressableEnergy>
            )}
          </KineticStack>

          {plan && (
            <div style={breakPanel}>
              <p style={breakHeadline}>
                {plan.headline} · {breakMinutes} min — try one of these
              </p>
              <ul style={breakList}>
                {plan.suggestions.map((s) => (
                  <li key={s.label} style={breakItem}>
                    <strong style={breakItemLabel}>{s.label}</strong>
                    <span style={breakItemDetail}>{s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={footer}>
            <button type="button" style={linkBtn} onClick={() => setShowTuner((v) => !v)}>
              {showTuner ? "Hide intervals" : "Adjust intervals"}
            </button>
            <button type="button" style={linkBtn} onClick={() => toggleHud()}>
              {hudOpen ? "Hide HUD" : "Show HUD"}
            </button>
          </div>

          {showTuner && config && (
            <div style={tuner}>
              <MinuteField
                label="Focus"
                value={config.pomodoroFocusMinutes}
                onChange={async (v) => {
                  const next = await patchConfig({ pomodoroFocusMinutes: v });
                  setFocusMinutes(next.pomodoroFocusMinutes);
                }}
              />
              <MinuteField
                label="Short break"
                value={config.pomodoroShortBreakMinutes}
                onChange={(v) => patchConfig({ pomodoroShortBreakMinutes: v })}
              />
              <MinuteField
                label="Long break"
                value={config.pomodoroLongBreakMinutes}
                onChange={(v) => patchConfig({ pomodoroLongBreakMinutes: v })}
              />
              <MinuteField
                label="Cycle"
                value={config.pomodoroCycleLength}
                max={12}
                onChange={(v) => patchConfig({ pomodoroCycleLength: v })}
              />
            </div>
          )}
        </KineticStack>
      </Surface>
    </GlowBorder>
  );
}

function MinuteField({
  label,
  value,
  max = 240,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={tunerField}>
      <span style={tunerLabel}>{label}</span>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(1, Number(e.target.value) || 1)))}
        style={minutesInput}
      />
    </label>
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

const minutesInput = {
  width: "64px",
  padding: "4px 8px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  font: "inherit",
  fontSize: "12px",
};

const breakPanel = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-raised)",
  border: "1px solid var(--sb-border-subtle)",
};

const breakHeadline = {
  margin: "0 0 8px",
  fontSize: "12px",
  color: "var(--sb-text-secondary)",
};

const breakList = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "6px",
};

const breakItem = { display: "flex", flexDirection: "column" as const, gap: "1px" };
const breakItemLabel = { fontSize: "12px", color: "var(--sb-text-primary)" };
const breakItemDetail = { fontSize: "11px", color: "var(--sb-text-muted)" };

const footer = {
  display: "flex",
  gap: "16px",
  justifyContent: "center",
};

const linkBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  textDecoration: "underline",
  padding: 0,
};

const tuner = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  width: "100%",
};

const tunerField = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  fontSize: "12px",
  color: "var(--sb-text-secondary)",
};

const tunerLabel = { whiteSpace: "nowrap" as const };
