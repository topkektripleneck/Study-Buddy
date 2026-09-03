import { useCallback, useEffect, useMemo, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { api } from "@/lib/api";
import { pickSideQuest } from "@/lib/sideQuests";
import { Surface } from "@/ui/kit";
import type { EnergyLogEntry } from "@/types";

const DAYS = 7;
const LEVELS = [1, 2, 3, 4, 5] as const;

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function EnergyWidget() {
  const [entries, setEntries] = useState<EnergyLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEntries(await api.energyRecent(DAYS));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load energy log");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useListen(refresh, "energy:changed");

  const todayKey = localDateKey();
  const todayLevel = entries.find((e) => e.date === todayKey)?.level ?? null;
  const quest = useMemo(
    () => (todayLevel !== null && todayLevel <= 2 ? pickSideQuest(todayLevel) : null),
    [todayLevel],
  );

  const chartDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (DAYS - 1 - i));
      const key = localDateKey(d);
      const level = entries.find((e) => e.date === key)?.level ?? 0;
      const label = d.toLocaleDateString([], { weekday: "narrow" });
      return { key, level, label };
    });
  }, [entries]);

  async function logLevel(level: number) {
    setSaving(true);
    try {
      await api.energyLog(level);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save energy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface padding="md">
      <h3 style={title}>Energy Logger</h3>
      <p style={hint}>Rate today 1 (drained) to 5 (charged)</p>
      {error && <p style={errorText}>{error}</p>}

      <div style={chart} role="img" aria-label="7-day energy levels">
        {chartDays.map((day) => (
          <div key={day.key} style={barCol}>
            <div style={barTrack}>
              <div
                style={{
                  ...barFill,
                  height: day.level > 0 ? `${(day.level / 5) * 100}%` : "4px",
                  opacity: day.level > 0 ? 0.35 + (day.level / 5) * 0.65 : 0.2,
                }}
              />
            </div>
            <span style={barLabel}>{day.label}</span>
          </div>
        ))}
      </div>

      <div style={levelRow}>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className="sb-pressable"
            disabled={saving}
            style={{
              ...levelBtn,
              ...(todayLevel === level ? levelBtnActive : {}),
            }}
            onClick={() => logLevel(level)}
            aria-pressed={todayLevel === level}
          >
            {level}
          </button>
        ))}
      </div>

      {quest && (
        <div style={questPanel}>
          <p style={questTitle}>Side Quest · restore HP</p>
          <p style={questBody}>
            <strong>{quest.title}</strong> — {quest.detail}{" "}
            <span style={questHp}>{quest.hp}</span>
          </p>
        </div>
      )}
    </Surface>
  );
}

const title = { margin: "0 0 4px", fontSize: "16px" };
const hint = { margin: "0 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
const errorText = { margin: "0 0 8px", fontSize: "12px", color: "var(--sb-error)" };
const chart = {
  display: "flex",
  gap: "8px",
  alignItems: "flex-end",
  height: "100px",
  marginBottom: "12px",
};
const barCol = { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "4px" };
const barTrack = {
  width: "100%",
  height: "72px",
  borderRadius: "4px",
  background: "var(--sb-bg-base)",
  display: "flex",
  alignItems: "flex-end",
  overflow: "hidden",
};
const barFill = {
  width: "100%",
  background: "var(--sb-accent)",
  borderRadius: "4px 4px 0 0",
  transition: "height var(--sb-duration-normal) var(--sb-ease-out)",
};
const barLabel = { fontSize: "10px", color: "var(--sb-text-muted)" };
const levelRow = { display: "flex", gap: "6px", marginBottom: "8px" };
const levelBtn = {
  flex: 1,
  padding: "8px 0",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-secondary)",
  fontFamily: "var(--sb-font-mono)",
  fontWeight: 700,
};
const levelBtnActive = {
  borderColor: "var(--sb-border-glow)",
  color: "var(--sb-accent)",
  boxShadow: "0 0 12px var(--sb-glow-accent)",
};
const questPanel = {
  marginTop: "8px",
  padding: "10px 12px",
  borderRadius: "var(--sb-radius-sm)",
  background: "var(--sb-bg-raised)",
  border: "1px solid var(--sb-glow-warm)",
};
const questTitle = {
  margin: "0 0 6px",
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};
const questBody = { margin: 0, fontSize: "12px", color: "var(--sb-text-secondary)", lineHeight: 1.45 };
const questHp = { color: "var(--sb-accent)", fontFamily: "var(--sb-font-mono)" };
