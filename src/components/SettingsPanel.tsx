import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useListen } from "@/hooks/useListen";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { setDailyTarget, resetData, importCalendarIcs } from "@/lib/actions";
import { api } from "@/lib/api";
import { playChime } from "@/lib/chimes";
import {
  EIGHTBIT_PALETTE_OPTIONS,
  THEME_OPTIONS,
  ZODIAC_OPTIONS,
  type EightbitPalette,
  type ThemeId,
  type ZodiacSign,
} from "@/lib/themes";
import { applyThemeFromConfig, bumpThemeStore } from "@/lib/themeStore";
import type { AppConfig, SettingsSection } from "@/types";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

type SettingsSectionId = SettingsSection;

interface SettingsPanelProps {
  onClose: () => void;
  initialSection?: SettingsSectionId;
}

const SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "focus", label: "Focus & timer" },
  { id: "schedule", label: "Schedule" },
  { id: "windows", label: "Windows" },
  { id: "data", label: "Data" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: `${hour.toString().padStart(2, "0")}:00`,
}));

function formatQuietRange(start: number, end: number): string {
  const fmt = (h: number) =>
    new Date(2000, 0, 1, h).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function SettingsPanel({ onClose, initialSection }: SettingsPanelProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [section, setSection] = useState<SettingsSectionId>(initialSection ?? "appearance");
  const [saved, setSaved] = useState(false);
  const [testingNotify, setTestingNotify] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingIcs, setImportingIcs] = useState(false);
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState(120);
  const [pomodoroDraft, setPomodoroDraft] = useState({
    pomodoroFocusMinutes: 25,
    pomodoroShortBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroCycleLength: 4,
  });
  const hud = useWindowOpen("hud");

  useEffect(() => {
    api.configGet().then((loaded) => {
      setConfig(loaded);
      setPomodoroDraft({
        pomodoroFocusMinutes: loaded.pomodoroFocusMinutes,
        pomodoroShortBreakMinutes: loaded.pomodoroShortBreakMinutes,
        pomodoroLongBreakMinutes: loaded.pomodoroLongBreakMinutes,
        pomodoroCycleLength: loaded.pomodoroCycleLength,
      });
      api.autostartIsEnabled()
        .then((autostart) => setConfig((prev) => (prev ? { ...prev, autostart } : prev)))
        .catch(() => {});
    });
    api.metricsGet().then((m) => setDailyTargetMinutes(m.dailyTargetMinutes));
  }, []);

  const refreshDailyTarget = useCallback(() => {
    api.metricsGet().then((m) => setDailyTargetMinutes(m.dailyTargetMinutes));
  }, []);

  useListen(refreshDailyTarget, "metrics:changed");

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  const flashSaved = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }, []);

  async function update(patch: Partial<AppConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    const savedConfig = await api.configSave(next);
    setConfig(savedConfig);
    applyThemeFromConfig(savedConfig);
    bumpThemeStore();
    flashSaved();
  }

  async function saveDailyTarget() {
    const clamped = Math.min(480, Math.max(15, dailyTargetMinutes || 120));
    setDailyTargetMinutes(clamped);
    await setDailyTarget(clamped);
    flashSaved();
  }

  async function savePomodoro() {
    if (!config) return;
    const clamped = {
      pomodoroFocusMinutes: Math.max(1, pomodoroDraft.pomodoroFocusMinutes || 1),
      pomodoroShortBreakMinutes: Math.max(1, pomodoroDraft.pomodoroShortBreakMinutes || 1),
      pomodoroLongBreakMinutes: Math.max(1, pomodoroDraft.pomodoroLongBreakMinutes || 1),
      pomodoroCycleLength: Math.min(12, Math.max(1, pomodoroDraft.pomodoroCycleLength || 1)),
    };
    setPomodoroDraft(clamped);
    await update(clamped);
  }

  async function runReset(target: string, label: string) {
    if (!window.confirm(`Reset ${label}? This cannot be undone.`)) return;
    const result = await resetData(target);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    flashSaved();
  }

  async function exportBackup() {
    const dest = await save({
      defaultPath: `study-buddy-backup-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (!dest || typeof dest !== "string") return;
    setExporting(true);
    try {
      await api.storageExportZip(dest);
      flashSaved();
    } finally {
      setExporting(false);
    }
  }

  async function restoreBackup() {
    const src = await open({
      multiple: false,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (!src || typeof src !== "string") return;
    const ok = window.confirm(
      "Restore from this backup? Current data will be replaced. A pre-restore snapshot is saved under backups/ in your data folder.",
    );
    if (!ok) return;
    setImporting(true);
    try {
      const message = await api.storageImportZip(src);
      const next = await api.configGet();
      setConfig(next);
      applyThemeFromConfig(next);
      bumpThemeStore();
      window.alert(message);
      flashSaved();
    } catch (err) {
      window.alert(String(err));
    } finally {
      setImporting(false);
    }
  }

  async function pickChime(slot: "start" | "end") {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["mp3", "wav"] }],
    });
    if (!selected || typeof selected !== "string") return;
    setConfig(await api.chimeImport(selected, slot));
    flashSaved();
  }

  async function clearChime(slot: "start" | "end") {
    if (!config) return;
    const patch =
      slot === "start"
        ? { focusStartChimePath: null }
        : { focusEndChimePath: null };
    await update(patch);
  }

  async function testNotification() {
    setTestingNotify(true);
    try {
      await api.notifyTest();
      flashSaved();
    } finally {
      setTestingNotify(false);
    }
  }

  function chimeLabel(path?: string | null): string {
    if (!path) return "None";
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] ?? path;
  }

  if (!config) {
    return (
      <ModalBackdrop onClose={onClose} panelClassName="sb-settings-panel">
        <p style={{ margin: 0, color: "var(--sb-text-muted)" }}>Loading settings…</p>
      </ModalBackdrop>
    );
  }

  const themeId = (config.themeId ?? "galaxy") as ThemeId;

  return (
    <ModalBackdrop onClose={onClose} panelClassName="sb-settings-panel">
      <div className="sb-settings-header">
        <h2>Settings</h2>
        {saved && <p className="sb-settings-saved">Saved</p>}
      </div>

      <div className="sb-settings-body">
        <nav className="sb-settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sb-pressable sb-settings-nav-btn"
              aria-current={section === s.id ? "true" : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="sb-settings-content">
          {section === "appearance" && (
            <>
              <p className="sb-settings-section-title">Theme</p>
              <p className="sb-settings-section-desc">
                Pick a visual style. Astrology tints accents from your zodiac sign.
              </p>
              <div className="sb-theme-grid" role="group" aria-label="Theme">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="sb-pressable sb-theme-card"
                    aria-pressed={themeId === theme.id}
                    onClick={() => update({ themeId: theme.id })}
                  >
                    <div className="sb-theme-swatch" aria-hidden>
                      {theme.swatch.map((color) => (
                        <span key={color} style={{ background: color }} />
                      ))}
                    </div>
                    <span className="sb-theme-card-label">{theme.label}</span>
                    <span className="sb-theme-card-hint">{theme.hint}</span>
                  </button>
                ))}
              </div>
              {themeId === "astrology" && (
                <>
                  <p className="sb-settings-section-title">Zodiac sign</p>
                  <div className="sb-zodiac-grid" role="group" aria-label="Zodiac sign">
                    {ZODIAC_OPTIONS.map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        className="sb-pressable sb-zodiac-chip"
                        aria-pressed={(config.zodiacSign ?? "leo") === z.id}
                        onClick={() => update({ zodiacSign: z.id as ZodiacSign })}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {themeId === "eightbit" && (
                <>
                  <p className="sb-settings-section-title">8-bit palette</p>
                  <p className="sb-settings-section-desc">
                    Accent color only — fonts and icons stay the same.
                  </p>
                  <div className="sb-zodiac-grid" role="group" aria-label="8-bit palette">
                    {EIGHTBIT_PALETTE_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="sb-pressable sb-zodiac-chip"
                        aria-pressed={(config.eightbitPalette ?? "green") === p.id}
                        onClick={() => update({ eightbitPalette: p.id as EightbitPalette })}
                        style={{ borderColor: p.swatch }}
                      >
                        <span
                          aria-hidden
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: p.swatch,
                            marginRight: 6,
                          }}
                        />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {section === "notifications" && (
            <>
              <p className="sb-settings-section-title">Alerts</p>
              <p className="sb-settings-section-desc">
                In-app toasts appear while Study Buddy is open (even if another app is
                focused). OS notifications fire when the workspace is not focused. When
                minimized, a corner popup also appears.
              </p>
              <label className="sb-settings-row">
                <span>Timer, streak &amp; daily-target alerts</span>
                <input
                  type="checkbox"
                  checked={config.notifyTimer ?? true}
                  onChange={(e) => update({ notifyTimer: e.target.checked })}
                />
              </label>
              <p className="sb-settings-section-desc">
                Includes focus/break phase changes, streak-at-risk (after 6 pm), and daily goal
                reached.
              </p>
              <label className="sb-settings-row">
                <span>Calendar block start &amp; end</span>
                <input
                  type="checkbox"
                  checked={config.notifyBlocks ?? true}
                  onChange={(e) => update({ notifyBlocks: e.target.checked })}
                />
              </label>
              <label className="sb-settings-row">
                <span>Quiet hours (suppress OS notifications)</span>
                <input
                  type="checkbox"
                  checked={config.notifyQuietHoursEnabled ?? false}
                  onChange={(e) => update({ notifyQuietHoursEnabled: e.target.checked })}
                />
              </label>
              {(config.notifyQuietHoursEnabled ?? false) && (
                <div className="sb-settings-subgroup">
                  <label className="sb-settings-row">
                    <span>Start</span>
                    <select
                      className="sb-input"
                      value={config.notifyQuietStartHour ?? 22}
                      onChange={(e) =>
                        update({ notifyQuietStartHour: Number(e.target.value) })
                      }
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sb-settings-row">
                    <span>End</span>
                    <select
                      className="sb-input"
                      value={config.notifyQuietEndHour ?? 8}
                      onChange={(e) =>
                        update({ notifyQuietEndHour: Number(e.target.value) })
                      }
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="sb-settings-section-desc">
                    OS alerts are muted from{" "}
                    {formatQuietRange(
                      config.notifyQuietStartHour ?? 22,
                      config.notifyQuietEndHour ?? 8,
                    )}
                    . In-app toasts still appear.
                  </p>
                </div>
              )}
              <PressableEnergy
                variant="ghost"
                onClick={testNotification}
                disabled={testingNotify}
              >
                {testingNotify ? "Sending…" : "Send test notification"}
              </PressableEnergy>
            </>
          )}

          {section === "focus" && (
            <>
              <p className="sb-settings-section-title">Daily focus goal</p>
              <p className="sb-settings-section-desc">
                Focus and stopwatch time logged today counts toward this target and your streak.
              </p>
              <label className="sb-settings-row">
                <span>Target (minutes)</span>
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  className="sb-input sb-input-narrow"
                  value={dailyTargetMinutes}
                  onChange={(e) => setDailyTargetMinutes(Number(e.target.value))}
                  onBlur={saveDailyTarget}
                />
              </label>

              <p className="sb-settings-section-title" style={{ marginTop: 20 }}>
                Pomodoro
              </p>
              <p className="sb-settings-section-desc">
                Changes apply on blur. The timer picks up new durations on the next phase.
              </p>
              <label className="sb-settings-row">
                <span>Focus (minutes)</span>
                <input
                  type="number"
                  min={1}
                  className="sb-input sb-input-narrow"
                  value={pomodoroDraft.pomodoroFocusMinutes}
                  onChange={(e) =>
                    setPomodoroDraft((d) => ({
                      ...d,
                      pomodoroFocusMinutes: Number(e.target.value),
                    }))
                  }
                  onBlur={savePomodoro}
                />
              </label>
              <label className="sb-settings-row">
                <span>Short break (minutes)</span>
                <input
                  type="number"
                  min={1}
                  className="sb-input sb-input-narrow"
                  value={pomodoroDraft.pomodoroShortBreakMinutes}
                  onChange={(e) =>
                    setPomodoroDraft((d) => ({
                      ...d,
                      pomodoroShortBreakMinutes: Number(e.target.value),
                    }))
                  }
                  onBlur={savePomodoro}
                />
              </label>
              <label className="sb-settings-row">
                <span>Long break (minutes)</span>
                <input
                  type="number"
                  min={1}
                  className="sb-input sb-input-narrow"
                  value={pomodoroDraft.pomodoroLongBreakMinutes}
                  onChange={(e) =>
                    setPomodoroDraft((d) => ({
                      ...d,
                      pomodoroLongBreakMinutes: Number(e.target.value),
                    }))
                  }
                  onBlur={savePomodoro}
                />
              </label>
              <label className="sb-settings-row">
                <span>Focus blocks before a long break</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="sb-input sb-input-narrow"
                  value={pomodoroDraft.pomodoroCycleLength}
                  onChange={(e) =>
                    setPomodoroDraft((d) => ({
                      ...d,
                      pomodoroCycleLength: Number(e.target.value),
                    }))
                  }
                  onBlur={savePomodoro}
                />
              </label>

              <p className="sb-settings-section-title" style={{ marginTop: 20 }}>
                Focus chimes
              </p>
              <div className="sb-chime-row">
                <span>Focus start</span>
                <span className="sb-chime-name">{chimeLabel(config.focusStartChimePath)}</span>
                <PressableEnergy variant="ghost" onClick={() => pickChime("start")}>
                  Browse
                </PressableEnergy>
                {config.focusStartChimePath && (
                  <>
                    <PressableEnergy
                      variant="ghost"
                      onClick={() => playChime(config.focusStartChimePath)}
                    >
                      Test
                    </PressableEnergy>
                    <PressableEnergy variant="ghost" onClick={() => clearChime("start")}>
                      Clear
                    </PressableEnergy>
                  </>
                )}
              </div>
              <div className="sb-chime-row">
                <span>Focus finish</span>
                <span className="sb-chime-name">{chimeLabel(config.focusEndChimePath)}</span>
                <PressableEnergy variant="ghost" onClick={() => pickChime("end")}>
                  Browse
                </PressableEnergy>
                {config.focusEndChimePath && (
                  <>
                    <PressableEnergy
                      variant="ghost"
                      onClick={() => playChime(config.focusEndChimePath)}
                    >
                      Test
                    </PressableEnergy>
                    <PressableEnergy variant="ghost" onClick={() => clearChime("end")}>
                      Clear
                    </PressableEnergy>
                  </>
                )}
              </div>
            </>
          )}

          {section === "schedule" && (
            <>
              <p className="sb-settings-section-title">Calendar</p>
              <label className="sb-settings-row">
                <span>Colored time blocks</span>
                <input
                  type="checkbox"
                  checked={config.coloredTimeBlocks}
                  onChange={(e) => update({ coloredTimeBlocks: e.target.checked })}
                />
              </label>
              <label className="sb-settings-row">
                <span>Prompt to create a task when adding a block</span>
                <input
                  type="checkbox"
                  checked={config.promptTaskOnBlockCreate ?? true}
                  onChange={(e) => update({ promptTaskOnBlockCreate: e.target.checked })}
                />
              </label>

              <p className="sb-settings-section-title" style={{ marginTop: 20 }}>
                Import
              </p>
              <p className="sb-settings-section-desc">
                Import events from a Google Calendar .ics export. Events become
                Focus blocks; duplicates (same title + start time) are skipped.
              </p>
              <PressableEnergy
                variant="ghost"
                disabled={importingIcs}
                onClick={async () => {
                  const src = await open({
                    multiple: false,
                    filters: [{ name: "iCalendar", extensions: ["ics"] }],
                  });
                  if (!src || typeof src !== "string") return;
                  setImportingIcs(true);
                  try {
                    const result = await importCalendarIcs(src);
                    window.alert(result.message);
                    flashSaved();
                  } finally {
                    setImportingIcs(false);
                  }
                }}
              >
                {importingIcs ? "Importing…" : "Import Google Calendar (.ics)"}
              </PressableEnergy>
            </>
          )}

          {section === "windows" && (
            <>
              <p className="sb-settings-section-title">HUD</p>
              <p className="sb-settings-section-desc">
                The HUD is a small floating window for the active timer.
              </p>
              <label className="sb-settings-row">
                <span>Show the floating HUD window</span>
                <input type="checkbox" checked={hud.open} onChange={() => hud.toggle()} />
              </label>
              <label className="sb-settings-row">
                <span>Auto-show HUD when a session starts</span>
                <input
                  type="checkbox"
                  checked={config.hudAutoShowOnSessionStart}
                  onChange={(e) => update({ hudAutoShowOnSessionStart: e.target.checked })}
                />
              </label>

              <p className="sb-settings-section-title" style={{ marginTop: 20 }}>
                System startup
              </p>
              <p className="sb-settings-section-desc">
                Launch Study Buddy automatically when your computer starts up.
              </p>
              <label className="sb-settings-row">
                <span>Run Study Buddy on system startup</span>
                <input
                  type="checkbox"
                  checked={config.autostart ?? false}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    try {
                      if (enabled) {
                        await api.autostartEnable();
                      } else {
                        await api.autostartDisable();
                      }
                      update({ autostart: enabled });
                    } catch (err) {
                      console.error("Failed to toggle autostart:", err);
                    }
                  }}
                />
              </label>
            </>
          )}

          {section === "data" && (
            <>
              <p className="sb-settings-section-title">Local storage</p>
              <p className="sb-settings-section-desc">
                Everything lives in local JSON files under your app data folder. Export a zip
                backup anytime; restore replaces local data (your current state is snapshotted
                under backups/ first).
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <PressableEnergy variant="ghost" onClick={() => api.openDataDir()}>
                  Open data folder
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={exportBackup} disabled={exporting}>
                  {exporting ? "Exporting…" : "Export backup zip"}
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={restoreBackup} disabled={importing}>
                  {importing ? "Restoring…" : "Restore from backup"}
                </PressableEnergy>
              </div>

              <p className="sb-settings-section-title" style={{ marginTop: 20 }}>
                Reset data
              </p>
              <p className="sb-settings-section-desc">
                Clears saved data in place. Export a backup first if you might need it later.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <PressableEnergy variant="ghost" onClick={() => runReset("timer", "the active timer")}>
                  Reset timer
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => runReset("metrics", "focus history & streaks")}>
                  Reset metrics
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => runReset("tasks", "all tasks")}>
                  Reset tasks
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => runReset("calendar", "calendar blocks")}>
                  Reset calendar
                </PressableEnergy>
                <PressableEnergy variant="ghost" onClick={() => runReset("all", "everything")}>
                  Reset all data
                </PressableEnergy>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sb-settings-footer">
        <PressableEnergy variant="ghost" onClick={onClose}>
          Close
        </PressableEnergy>
      </div>
    </ModalBackdrop>
  );
}
