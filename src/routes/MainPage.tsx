import { useEffect, useState, type KeyboardEvent } from "react";

import { ConsistencyBar } from "@/components/ConsistencyBar";
import { CommandBar } from "@/components/CommandBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ZodiacBackdrop } from "@/components/ZodiacBackdrop";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { onNavigate, onOpenSettings, openSettings } from "@/lib/actions";
import { KineticStack, PressableEnergy } from "@/ui/kit";
import { MatrixView } from "@/views/MatrixView";
import { ScheduleView } from "@/views/ScheduleView";
import { WidgetsView } from "@/views/WidgetsView";
import type { MainTab, SettingsSection } from "@/types";

const TABS: { id: MainTab; label: string }[] = [
  { id: "widgets", label: "Widgets" },
  { id: "schedule", label: "Schedule / Calendar" },
  { id: "matrix", label: "Eisenhower Matrix" },
];

export function MainPage() {
  const [tab, setTab] = useState<MainTab>("widgets");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>();
  const calendarWindow = useWindowOpen("calendar");

  useEffect(() => onNavigate(setTab), []);
  useEffect(
    () =>
      onOpenSettings((section) => {
        setSettingsSection(section);
        setSettingsOpen(true);
      }),
    [],
  );

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setTab(next.id);
  }

  return (
    <div style={page} className="sb-main-page">
      <ZodiacBackdrop />
      <div className="sb-themed-page__content">
      <header style={header}>
        <div>
          <p style={eyebrow}>Study Buddy</p>
          <nav style={nav} role="tablist" aria-label="Main views">
            {TABS.map((t, index) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className="sb-pressable sb-pressable-hover"
                style={{
                  ...tabBtn,
                  ...(tab === t.id ? tabActive : {}),
                }}
                onClick={() => setTab(t.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <KineticStack direction="row" gap="sm">
          <PressableEnergy variant="ghost" onClick={() => openSettings()}>
            Settings
          </PressableEnergy>
          <PressableEnergy variant="ghost" onClick={() => calendarWindow.toggle()}>
            {calendarWindow.open ? "Close Calendar Window" : "Open Calendar Window"}
          </PressableEnergy>
        </KineticStack>
      </header>

      <ConsistencyBar />

      <main style={content} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <div className="sb-tab-panel" hidden={tab !== "widgets"}>
          <WidgetsView />
        </div>
        <div className="sb-tab-panel" hidden={tab !== "schedule"}>
          <ScheduleView />
        </div>
        <div className="sb-tab-panel" hidden={tab !== "matrix"}>
          <MatrixView />
        </div>
      </main>

      {settingsOpen && (
        <SettingsPanel
          initialSection={settingsSection}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsSection(undefined);
          }}
        />
      )}

      <CommandBar />
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  padding: "var(--sb-space-lg)",
  overflow: "auto",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "var(--sb-space-md)",
  gap: "var(--sb-space-md)",
  flexWrap: "wrap" as const,
  padding: "var(--sb-space-md) var(--sb-space-lg)",
  borderRadius: "var(--sb-radius-lg)",
  background: "var(--sb-bg-overlay)",
  border: "1px solid var(--sb-border-subtle)",
};

const eyebrow = {
  margin: "0 0 8px",
  fontSize: "12px",
  letterSpacing: "var(--sb-tracking-caps)",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};

const nav = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap" as const,
};

const tabBtn = {
  padding: "8px 14px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "transparent",
  color: "var(--sb-text-secondary)",
  cursor: "pointer",
  font: "inherit",
};

const tabActive = {
  background: "var(--sb-bg-overlay)",
  color: "var(--sb-accent)",
  borderColor: "var(--sb-border-glow)",
  boxShadow: "0 0 12px var(--sb-glow-accent)",
};

const content = {
  minHeight: "480px",
  paddingBottom: "72px",
};
