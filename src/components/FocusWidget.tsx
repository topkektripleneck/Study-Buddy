import { GlowBorder, KineticStack, PressableEnergy, Surface } from "@/ui/kit";
import { useTimer } from "@/hooks/useTimer";
import { api } from "@/lib/api";
import { openWindow } from "@/lib/windows";

export function FocusWidget() {
  const { displayTime, isRunning, isPaused, isIdle, start, pause, resume, reset, tick } =
    useTimer();

  async function handleStart() {
    await start("pomodoro");
    const config = await api.configGet();
    if (config.hudAutoShowOnSessionStart) {
      openWindow("hud");
    }
  }

  return (
    <GlowBorder active={isRunning} tone="accent">
      <Surface padding="lg" variant="overlay">
        <KineticStack gap="md" align="center">
          <p style={phaseLabel}>{tick?.phase?.replace("_", " ") ?? "focus"}</p>
          <p style={timerDisplay}>{displayTime}</p>
          <KineticStack direction="row" gap="sm">
            {isIdle && (
              <PressableEnergy onClick={handleStart}>Start</PressableEnergy>
            )}
            {isRunning && <PressableEnergy onClick={() => pause()}>Pause</PressableEnergy>}
            {isPaused && <PressableEnergy onClick={() => resume()}>Resume</PressableEnergy>}
            {!isIdle && (
              <PressableEnergy variant="ghost" onClick={() => reset()}>
                Reset
              </PressableEnergy>
            )}
            <PressableEnergy variant="ghost" onClick={() => openWindow("hud")}>
              HUD
            </PressableEnergy>
          </KineticStack>
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
