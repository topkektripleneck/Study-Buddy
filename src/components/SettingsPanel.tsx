import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppConfig } from "@/types";
import { PressableEnergy, Surface } from "@/ui/kit";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.configGet().then(setConfig);
  }, []);

  async function update(patch: Partial<AppConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(await api.configSave(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!config) return null;

  return (
    <div style={overlay} onClick={onClose} role="presentation">
      <Surface
        padding="lg"
        variant="overlay"
        style={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={heading}>Settings</h2>
        {saved && <p style={savedMsg}>Saved</p>}

        <label style={row}>
          <span>Colored timeblocking</span>
          <input
            type="checkbox"
            checked={config.coloredTimeBlocks}
            onChange={(e) => update({ coloredTimeBlocks: e.target.checked })}
          />
        </label>

        <label style={row}>
          <span>Prompt to create task when adding a time block</span>
          <input
            type="checkbox"
            checked={config.promptTaskOnBlockCreate ?? true}
            onChange={(e) => update({ promptTaskOnBlockCreate: e.target.checked })}
          />
        </label>

        <label style={row}>
          <span>Auto-show HUD when focus session starts</span>
          <input
            type="checkbox"
            checked={config.hudAutoShowOnSessionStart}
            onChange={(e) => update({ hudAutoShowOnSessionStart: e.target.checked })}
          />
        </label>

        <div style={section}>
          <p style={sectionTitle}>Pomodoro</p>
          <label style={row}>
            <span>Focus (minutes)</span>
            <input
              type="number"
              min={1}
              style={numInput}
              value={config.pomodoroFocusMinutes}
              onChange={(e) =>
                update({ pomodoroFocusMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>

        <PressableEnergy variant="ghost" onClick={onClose}>
          Close
        </PressableEnergy>
      </Surface>
    </div>
  );
}

const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const panel = { width: "min(440px, 92vw)" };
const heading = { margin: "0 0 16px", fontSize: "18px" };
const savedMsg = { margin: "0 0 12px", color: "var(--sb-accent)", fontSize: "13px" };
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  marginBottom: "12px",
  fontSize: "14px",
};
const section = { marginTop: "8px", marginBottom: "16px" };
const sectionTitle = {
  margin: "0 0 8px",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--sb-text-muted)",
};
const numInput = {
  width: "64px",
  padding: "4px 8px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
};
