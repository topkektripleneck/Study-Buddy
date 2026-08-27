import { Surface } from "@/ui/kit";
import { useMetrics } from "@/hooks/useTimer";

export function HeatmapWidget() {
  const { metrics } = useMetrics();
  const cells = Array.from({ length: 28 }, (_, i) => {
    const intensity = (i * 7) % 5;
    return intensity;
  });

  return (
    <Surface padding="md">
      <h3 style={title}>Activity</h3>
      <div style={grid}>
        {cells.map((level, i) => (
          <div
            key={i}
            style={{
              ...cell,
              opacity: 0.2 + level * 0.18,
              background: "var(--sb-accent)",
            }}
          />
        ))}
      </div>
      <p style={meta}>
        Streak: {metrics?.currentStreakDays ?? 0}d · Today:{" "}
        {metrics?.todayCompletionPercent ?? 0}%
      </p>
    </Surface>
  );
}

const title = { margin: "0 0 12px", fontSize: "16px" };
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "4px",
};
const cell = {
  aspectRatio: "1",
  borderRadius: "3px",
};
const meta = {
  margin: "12px 0 0",
  fontSize: "12px",
  color: "var(--sb-text-secondary)",
};
