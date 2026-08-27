import { useMetrics, useTimer } from "@/hooks/useTimer";
import { useNow } from "@/hooks/useNow";
import { closeWindow } from "@/lib/windows";
import { KineticStack, Surface } from "@/ui/kit";

export function HudPage() {
  const { displayTime, tick, isIdle, isRunning } = useTimer();
  const { metrics } = useMetrics();
  const now = useNow(1_000);

  const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const phase = isIdle ? "idle" : (tick?.phase ?? "timer").replace("_", " ");

  return (
    <div data-tauri-drag-region style={hudShell}>
      <Surface padding="sm" variant="overlay" style={hudBar}>
        <KineticStack direction="row" gap="md" align="center">
          <span
            style={{
              ...pulse,
              background: isRunning ? "var(--sb-accent)" : "var(--sb-text-muted)",
              boxShadow: isRunning ? "0 0 8px var(--sb-glow-accent)" : "none",
            }}
            aria-hidden
          />
          <Metric label={phase} value={isIdle ? clock : displayTime} />
          <Metric label="Streak" value={`${metrics?.currentStreakDays ?? 0}d`} />
          <Metric label="Today" value={`${metrics?.todayCompletionPercent ?? 0}%`} />
          <button
            type="button"
            style={closeBtn}
            onClick={() => closeWindow("hud")}
            title="Hide HUD"
          >
            ×
          </button>
        </KineticStack>
      </Surface>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span style={metricLabel}>{label}</span>
      <span style={metricValue}>{value}</span>
    </div>
  );
}

const hudShell = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  padding: "var(--sb-space-sm)",
};

const hudBar = {
  width: "100%",
  background: "var(--sb-bg-hud)",
  border: "1px solid var(--sb-border-glow)",
  boxShadow: "0 0 20px var(--sb-glow-accent)",
};

const pulse = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  flexShrink: 0,
};

const metricStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "2px",
  minWidth: "68px",
};

const metricLabel = {
  fontSize: "10px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};

const metricValue = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "18px",
  fontWeight: 700,
  color: "var(--sb-accent)",
};

const closeBtn = {
  marginLeft: "auto",
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  fontSize: "18px",
  lineHeight: 1,
  padding: "0 2px",
};
