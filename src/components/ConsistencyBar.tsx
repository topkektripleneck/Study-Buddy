import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { useMetrics } from "@/hooks/useTimer";
import { openSettings, setDailyTarget } from "@/lib/actions";
import { api } from "@/lib/api";
import type { DailyFocus } from "@/types";

const DAYS = 28;
const GOAL_PRESETS = [60, 90, 120, 180];

/** Compact focus-consistency strip — always visible below the main header. */
export function ConsistencyBar() {
  const { metrics, refresh } = useMetrics();
  const [days, setDays] = useState<DailyFocus[]>([]);
  const [draftTarget, setDraftTarget] = useState(120);
  const targetMinutes = metrics?.dailyTargetMinutes ?? 120;

  const refreshDays = useCallback(async () => {
    try {
      setDays(await api.activityDailyTotals(DAYS));
    } catch {
      setDays([]);
    }
  }, []);

  useEffect(() => {
    refreshDays();
  }, [refreshDays]);

  useEffect(() => {
    setDraftTarget(targetMinutes);
  }, [targetMinutes]);

  useListen(refreshDays, "metrics:changed");
  useListen(refresh, "metrics:changed");

  async function applyTarget(minutes: number) {
    await setDailyTarget(minutes);
    await refresh();
  }

  const targetMs = targetMinutes * 60_000;
  const cells =
    days.length > 0
      ? days
      : Array.from({ length: DAYS }, (_, i) => ({
          date: `placeholder-${i}`,
          focusMs: 0,
          metTarget: false,
        }));

  return (
    <div style={bar} aria-label="Focus consistency">
      <div style={grid}>
        {cells.map((day) => {
          const ratio = targetMs > 0 ? Math.min(day.focusMs / targetMs, 1) : 0;
          const minutes = Math.round(day.focusMs / 60_000);
          const titled = !day.date.startsWith("placeholder");
          return (
            <div
              key={day.date}
              title={titled ? `${day.date} · ${minutes} min` : undefined}
              style={{
                ...cell,
                background: ratio > 0 ? "var(--sb-accent)" : "var(--sb-bg-base)",
                opacity: ratio > 0 ? 0.25 + ratio * 0.75 : 1,
                border: day.metTarget ? "1px solid var(--sb-border-glow)" : "1px solid transparent",
              }}
            />
          );
        })}
      </div>
      <div style={footer}>
        <p style={meta}>
          Streak {metrics?.currentStreakDays ?? 0}d · Today {metrics?.todayCompletionPercent ?? 0}%
        </p>
        <div style={goalRow}>
          <span style={goalLabel}>Goal</span>
          {GOAL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={{ ...chip, ...(targetMinutes === m ? chipActive : {}) }}
              onClick={() => applyTarget(m)}
            >
              {m}m
            </button>
          ))}
          <input
            type="number"
            min={15}
            max={480}
            step={15}
            className="sb-input"
            style={goalInput}
            value={draftTarget}
            aria-label="Daily focus goal minutes"
            onChange={(e) => setDraftTarget(Number(e.target.value) || 15)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyTarget(draftTarget);
            }}
            onBlur={() => applyTarget(draftTarget)}
          />
          <button type="button" style={linkBtn} onClick={() => openSettings("focus")}>
            More
          </button>
        </div>
      </div>
    </div>
  );
}

const bar = {
  marginBottom: "var(--sb-space-lg)",
  padding: "var(--sb-space-sm) var(--sb-space-md)",
  borderRadius: "var(--sb-radius-md)",
  background: "var(--sb-bg-overlay)",
  border: "1px solid var(--sb-border-subtle)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(28, 1fr)",
  gap: "3px",
  marginBottom: "8px",
};

const cell = {
  height: "14px",
  borderRadius: "2px",
};

const footer = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
};

const meta = {
  margin: 0,
  fontSize: "11px",
  color: "var(--sb-text-muted)",
  letterSpacing: "0.02em",
};

const goalRow = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: "4px",
};

const goalLabel = {
  fontSize: "10px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--sb-text-muted)",
  marginRight: "2px",
};

const chip = {
  padding: "2px 8px",
  borderRadius: "999px",
  border: "1px solid var(--sb-border-subtle)",
  background: "transparent",
  color: "var(--sb-text-secondary)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "11px",
};

const chipActive = {
  borderColor: "var(--sb-border-glow)",
  color: "var(--sb-accent)",
};

const goalInput = {
  width: "52px",
  padding: "2px 6px",
  fontSize: "11px",
};

const linkBtn = {
  border: "none",
  background: "transparent",
  color: "var(--sb-text-muted)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "11px",
  textDecoration: "underline",
  padding: "0 4px",
};
