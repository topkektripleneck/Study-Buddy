import { useCallback, useEffect, useMemo, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { useMetrics } from "@/hooks/useTimer";
import { openSettings, setDailyTarget } from "@/lib/actions";
import { api } from "@/lib/api";
import type { DailyFocus } from "@/types";

const DAYS = 28;
const GOAL_PRESETS = [60, 90, 120, 180];

function localDateKey(date = new Date()): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Compact focus-consistency strip — always visible below the main header. */
export function ConsistencyBar() {
  const { metrics, refresh } = useMetrics();
  const [days, setDays] = useState<DailyFocus[]>([]);
  const [draftTarget, setDraftTarget] = useState(120);
  const targetMinutes = metrics?.dailyTargetMinutes ?? 120;
  const currentStreak = metrics?.currentStreakDays ?? 0;
  const longestStreak = metrics?.longestStreakDays ?? 0;
  const isOverridden = metrics?.streakOverride !== undefined && metrics?.streakOverride !== null;
  const freezeUsed = Boolean(metrics?.streakFreezeUsed);
  const todayPercent = metrics?.todayCompletionPercent ?? 0;
  const todayFocusMs = metrics?.todayFocusMs ?? 0;
  const remainingMin = Math.max(0, targetMinutes - Math.round(todayFocusMs / 60_000));
  const hour = new Date().getHours();
  const atRisk = currentStreak > 0 && todayPercent < 100 && hour >= 18;

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
          inCurrentStreak: false,
        }));

  const status = useMemo(() => {
    if (isOverridden) return `Manual count · Best ${longestStreak}d`;
    if (currentStreak === 0) {
      return `Log ${targetMinutes}m today to start a streak`;
    }
    const parts: string[] = [];
    if (todayPercent >= 100) {
      parts.push("Target met");
    } else if (atRisk) {
      parts.push(`At risk · ${remainingMin}m left`);
    } else {
      parts.push(`${remainingMin}m left today`);
    }
    if (freezeUsed) parts.push("Grace used");
    else parts.push("1 miss forgiven");
    parts.push(`Best ${longestStreak}d`);
    return parts.join(" · ");
  }, [
    atRisk,
    currentStreak,
    freezeUsed,
    isOverridden,
    longestStreak,
    remainingMin,
    targetMinutes,
    todayPercent,
  ]);

  return (
    <div style={bar} aria-label="Focus streak">
      <div style={topRow}>
        <div style={streakHero} title={isOverridden ? "Manual streak override" : undefined}>
          <span style={flame} aria-hidden>
            {currentStreak > 0 ? "🔥" : "○"}
          </span>
          <div>
            <div style={streakValueRow}>
              <span style={streakNumber}>{currentStreak}</span>
              <span style={streakUnit}>day{currentStreak === 1 ? "" : "s"}</span>
            </div>
            <p style={statusLine}>{status}</p>
          </div>
        </div>

        <div style={goalRow}>
          <span style={goalLabel}>Daily Goal</span>
          {GOAL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={{ ...chip, ...(draftTarget === m ? chipActive : {}) }}
              onClick={() => {
                setDraftTarget(m);
                void applyTarget(m);
              }}
            >
              {m}m
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={480}
            step={5}
            className="sb-input"
            style={goalInput}
            value={draftTarget || ""}
            aria-label="Daily focus goal minutes"
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value);
              setDraftTarget(val);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyTarget(draftTarget || 1);
            }}
            onBlur={() => {
              if (draftTarget > 0) {
                void applyTarget(draftTarget);
              } else {
                setDraftTarget(targetMinutes);
              }
            }}
          />
          <button type="button" style={linkBtn} onClick={() => openSettings("focus")}>
            {isOverridden ? "Adjust streak" : "More"}
          </button>
        </div>
      </div>

      <div style={grid}>
        {cells.map((day) => {
          const ratio = targetMs > 0 ? Math.min(day.focusMs / targetMs, 1) : 0;
          const minutes = Math.round(day.focusMs / 60_000);
          const titled = !day.date.startsWith("placeholder");
          const inStreak = Boolean(day.inCurrentStreak);
          const isToday = titled && day.date === localDateKey();
          return (
            <div
              key={day.date}
              title={titled ? `${day.date} · ${minutes} min` : undefined}
              style={{
                ...cell,
                background: ratio > 0 ? "var(--sb-accent)" : "var(--sb-bg-base)",
                opacity: inStreak ? 1 : ratio > 0 ? 0.35 + ratio * 0.4 : 0.55,
                border: inStreak
                  ? "1px solid var(--sb-border-glow)"
                  : day.metTarget
                    ? "1px solid var(--sb-border-subtle)"
                    : "1px solid transparent",
                boxShadow: inStreak ? "0 0 6px var(--sb-glow-accent)" : "none",
                outline: isToday && atRisk ? "1px solid var(--sb-accent)" : "none",
              }}
            />
          );
        })}
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

const topRow = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "10px",
};

const streakHero = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  minWidth: "220px",
};

const flame = {
  fontSize: "22px",
  lineHeight: 1,
};

const streakValueRow = {
  display: "flex",
  alignItems: "baseline",
  gap: "6px",
};

const streakNumber = {
  fontSize: "28px",
  fontWeight: 700,
  lineHeight: 1,
  fontFamily: "var(--sb-font-mono)",
  color: "var(--sb-accent)",
};

const streakUnit = {
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};

const statusLine = {
  margin: "4px 0 0",
  fontSize: "11px",
  color: "var(--sb-text-secondary)",
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(28, 1fr)",
  gap: "3px",
};

const cell = {
  height: "14px",
  borderRadius: "2px",
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
