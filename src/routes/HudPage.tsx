import { KineticStack, Surface } from "@/ui/kit";
import { useMetrics, useTimer } from "@/hooks/useTimer";

export function HudPage() {
  const { displayTime, tick } = useTimer();
  const { metrics } = useMetrics();

  return (
    <div data-tauri-drag-region style={hudShell}>
      <Surface padding="sm" variant="overlay" style={hudBar}>
        <KineticStack direction="row" gap="md" align="center">
          <Metric
            label={tick?.phase?.replace("_", " ") ?? "timer"}
            value={displayTime}
          />
          <Metric label="Streak" value={`${metrics?.currentStreakDays ?? 0}d`} />
          <Metric label="Today" value={`${metrics?.todayCompletionPercent ?? 0}%`} />
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

const metricStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "2px",
  minWidth: "72px",
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
