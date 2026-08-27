import { useEffect, useState } from "react";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { api } from "@/lib/api";
import type { AppConfig } from "@/types";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const hud = useWindowOpen("hud");

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
    <ModalBackdrop onClose={onClose} panelStyle={panel}>
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

      <div style={section}>
        <p style={sectionTitle}>HUD</p>
        <label style={row}>
          <span>Show the floating HUD window</span>
          <input type="checkbox" checked={hud.open} onChange={() => hud.toggle()} />
        </label>
        <label style={row}>
          <span>Auto-show HUD when a session starts</span>
          <input
            type="checkbox"
            checked={config.hudAutoShowOnSessionStart}
            onChange={(e) => update({ hudAutoShowOnSessionStart: e.target.checked })}
          />
        </label>
      </div>

      <div style={section}>
        <p style={sectionTitle}>Pomodoro</p>
        <label style={row}>
          <span>Focus (minutes)</span>
          <input
            type="number"
            min={1}
            className="sb-input sb-input-narrow"
            value={config.pomodoroFocusMinutes}
            onChange={(e) => update({ pomodoroFocusMinutes: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          <span>Short break (minutes)</span>
          <input
            type="number"
            min={1}
            className="sb-input sb-input-narrow"
            value={config.pomodoroShortBreakMinutes}
            onChange={(e) => update({ pomodoroShortBreakMinutes: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          <span>Long break (minutes)</span>
          <input
            type="number"
            min={1}
            className="sb-input sb-input-narrow"
            value={config.pomodoroLongBreakMinutes}
            onChange={(e) => update({ pomodoroLongBreakMinutes: Number(e.target.value) })}
          />
        </label>
        <label style={row}>
          <span>Focus blocks before a long break</span>
          <input
            type="number"
            min={1}
            max={12}
            className="sb-input sb-input-narrow"
            value={config.pomodoroCycleLength}
            onChange={(e) => update({ pomodoroCycleLength: Number(e.target.value) })}
          />
        </label>
      </div>

      <div style={section}>
        <p style={sectionTitle}>Data</p>
        <p style={dataNote}>
          Everything lives in local JSON files. A snapshot is taken once a day.
        </p>
        <PressableEnergy variant="ghost" onClick={() => api.openDataDir()}>
          Open data folder
        </PressableEnergy>
      </div>

      <PressableEnergy variant="ghost" onClick={onClose}>
        Close
      </PressableEnergy>
    </ModalBackdrop>
  );
}

const panel = { width: "min(440px, 92vw)" };
const heading = {
  margin: "0 0 16px",
  fontSize: "18px",
  lineHeight: 1.2,
  letterSpacing: "var(--sb-tracking-tight)",
};
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
const dataNote = {
  margin: "0 0 10px",
  fontSize: "12px",
  color: "var(--sb-text-muted)",
  lineHeight: 1.5,
};
