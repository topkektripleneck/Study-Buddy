import { useMetrics } from "@/hooks/useTimer";
import { Surface } from "@/ui/kit";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TargetRingWidget() {
  const { metrics } = useMetrics();
  const targetMinutes = metrics?.dailyTargetMinutes ?? 120;
  const focusMinutes = Math.round((metrics?.todayFocusMs ?? 0) / 60_000);
  const ratio = targetMinutes > 0 ? focusMinutes / targetMinutes : 0;
  const percent = Math.round(ratio * 100);
  const remaining = Math.max(targetMinutes - focusMinutes, 0);

  return (
    <Surface padding="md">
      <h3 style={title}>Daily Target</h3>
      <div style={ringWrap}>
        <svg viewBox="0 0 120 120" style={svg} role="img" aria-label={`${percent}% of daily focus target`}>
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--sb-bg-base)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--sb-accent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(ratio, 1))}
            transform="rotate(-90 60 60)"
            style={{ transition: "stroke-dashoffset var(--sb-duration-slow) var(--sb-ease-kinetic)" }}
          />
        </svg>
        <div style={center}>
          <span style={percentText}>{percent}%</span>
          <span style={ofText}>
            {focusMinutes}m / {targetMinutes}m
          </span>
        </div>
      </div>
      <p style={meta}>
        {remaining > 0 ? `${remaining}m left today` : "Target met"} · Streak{" "}
        {metrics?.currentStreakDays ?? 0}d
      </p>
    </Surface>
  );
}

const title = { margin: "0 0 12px", fontSize: "16px" };
const ringWrap = {
  position: "relative" as const,
  width: "160px",
  maxWidth: "100%",
  margin: "0 auto",
};
const svg = { width: "100%", display: "block" };
const center = {
  position: "absolute" as const,
  inset: 0,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
};
const percentText = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "28px",
  fontWeight: 700,
};
const ofText = { fontSize: "12px", color: "var(--sb-text-muted)" };
const meta = {
  margin: "12px 0 0",
  fontSize: "12px",
  color: "var(--sb-text-secondary)",
  textAlign: "center" as const,
};
