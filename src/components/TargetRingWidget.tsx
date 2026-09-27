import { useEffect, useState } from "react";
import { useMetrics } from "@/hooks/useTimer";
import { setDailyTarget } from "@/lib/actions";
import { PressableEnergy, Surface } from "@/ui/kit";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TARGET_PRESETS = [60, 90, 120, 180];

export function TargetRingWidget() {
  const { metrics, refresh } = useMetrics();
  const targetMinutes = metrics?.dailyTargetMinutes ?? 120;
  const [draftTarget, setDraftTarget] = useState(targetMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftTarget(targetMinutes);
  }, [targetMinutes]);

  const focusMinutes = Math.round((metrics?.todayFocusMs ?? 0) / 60_000);
  const ratio = targetMinutes > 0 ? (metrics?.todayFocusMs ?? 0) / (targetMinutes * 60_000) : 0;
  const percent = Math.min(100, Math.floor(ratio * 100));
  const remaining = Math.max(Math.ceil(targetMinutes - (metrics?.todayFocusMs ?? 0) / 60_000), 0);

  async function applyTarget(minutes: number) {
    const next = Math.min(480, Math.max(1, minutes));
    setDraftTarget(next);
    setSaving(true);
    try {
      const result = await setDailyTarget(next);
      setError(result.ok ? null : result.message);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Daily Target</h3>
      {error && <p role="alert">{error}</p>}
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

      <div style={goalRow}>
        <span style={goalLabel}>Goal</span>
        <div style={presets}>
          {TARGET_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={{ ...chip, ...(draftTarget === m ? chipActive : {}) }}
              disabled={saving}
              onClick={() => applyTarget(m)}
            >
              {m}m
            </button>
          ))}
        </div>
        <div style={customRow}>
          <input
            type="number"
            min={1}
            max={480}
            step={5}
            className="sb-input sb-input-narrow"
            value={draftTarget || ""}
            disabled={saving}
            aria-label="Daily focus goal in minutes"
            onChange={(e) => {
              const val = e.target.value === "" ? 0 : Number(e.target.value);
              setDraftTarget(val);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyTarget(draftTarget || 1);
            }}
          />
          <PressableEnergy variant="ghost" onClick={() => applyTarget(draftTarget || 1)} disabled={saving}>
            Set
          </PressableEnergy>
        </div>
      </div>
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
const goalRow = {
  marginTop: "14px",
  paddingTop: "12px",
  borderTop: "1px solid var(--sb-border-subtle)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
};
const goalLabel = {
  fontSize: "11px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--sb-text-muted)",
};
const presets = { display: "flex", flexWrap: "wrap" as const, gap: "6px" };
const chip = {
  padding: "4px 10px",
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
const customRow = { display: "flex", gap: "8px", alignItems: "center" };
