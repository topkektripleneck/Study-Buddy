import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { useMetrics } from "@/hooks/useTimer";
import { api } from "@/lib/api";
import { Surface } from "@/ui/kit";
import type { DailyFocus } from "@/types";

const DAYS = 28;

export function HeatmapWidget() {
  const { metrics } = useMetrics();
  const [days, setDays] = useState<DailyFocus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDays(await api.activityDailyTotals(DAYS));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load activity");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useListen(refresh, "metrics:changed");

  const targetMs = (metrics?.dailyTargetMinutes ?? 120) * 60_000;

  return (
    <Surface padding="md">
      <h3 style={title}>Activity</h3>
      {error && <p style={metaError}>{error}</p>}
      <div style={grid}>
        {days.map((day) => {
          const ratio = targetMs > 0 ? Math.min(day.focusMs / targetMs, 1) : 0;
          const minutes = Math.round(day.focusMs / 60_000);
          return (
            <div
              key={day.date}
              title={`${day.date} · ${minutes} min`}
              style={{
                ...cell,
                background: ratio > 0 ? "var(--sb-accent)" : "var(--sb-bg-base)",
                opacity: ratio > 0 ? 0.25 + ratio * 0.75 : 1,
                border: day.metTarget ? "1px solid var(--sb-border-glow)" : "1px solid transparent",
              }}
            />
          );
        })}
        {days.length === 0 &&
          Array.from({ length: DAYS }, (_, i) => (
            <div key={i} style={{ ...cell, background: "var(--sb-bg-base)" }} />
          ))}
      </div>
      <p style={meta}>
        Streak: {metrics?.currentStreakDays ?? 0}d · Today:{" "}
        {metrics?.todayCompletionPercent ?? 0}% of{" "}
        {metrics?.dailyTargetMinutes ?? 120}m
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
const metaError = {
  margin: "0 0 8px",
  fontSize: "12px",
  color: "#ffaaaa",
};
