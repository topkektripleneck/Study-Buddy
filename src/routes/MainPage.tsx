import { useEffect, useState } from "react";
import { CommandBar } from "@/components/CommandBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useWindowOpen } from "@/hooks/useWindowOpen";
import { onNavigate } from "@/lib/actions";
import { KineticStack, PressableEnergy } from "@/ui/kit";
import { MatrixView } from "@/views/MatrixView";
import { ScheduleView } from "@/views/ScheduleView";
import { WidgetsView } from "@/views/WidgetsView";
import type { MainTab } from "@/types";

const TABS: { id: MainTab; label: string }[] = [
  { id: "widgets", label: "Widgets" },
  { id: "schedule", label: "Schedule / Calendar" },
  { id: "matrix", label: "Eisenhower Matrix" },
];

export function MainPage() {
  const [tab, setTab] = useState<MainTab>("widgets");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const calendarWindow = useWindowOpen("calendar");
  const hudWindow = useWindowOpen("hud");

  useEffect(() => onNavigate(setTab), []);

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <p style={eyebrow}>Study Buddy</p>
          <nav style={nav}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="sb-pressable sb-pressable-hover"
                style={{
                  ...tabBtn,
                  ...(tab === t.id ? tabActive : {}),
                }}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <KineticStack direction="row" gap="sm">
          <PressableEnergy variant="ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </PressableEnergy>
          <PressableEnergy variant="ghost" onClick={() => calendarWindow.toggle()}>
            {calendarWindow.open ? "Close Calendar Window" : "Open Calendar Window"}
          </PressableEnergy>
          <PressableEnergy variant="ghost" onClick={() => hudWindow.toggle()}>
            {hudWindow.open ? "Remove HUD" : "Add HUD"}
          </PressableEnergy>
        </KineticStack>
      </header>

      <main style={content}>
        {tab === "widgets" && <WidgetsView />}
        {tab === "schedule" && <ScheduleView />}
        {tab === "matrix" && <MatrixView />}
      </main>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      <CommandBar />
    </div>
  );
}

const page = {
  minHeight: "100vh",
  padding: "var(--sb-space-lg)",
  background:
    "radial-gradient(ellipse at top, rgba(110, 231, 255, 0.05), transparent 55%), var(--sb-bg-base)",
  overflow: "auto",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "var(--sb-space-lg)",
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
  // Leaves room for the docked command bar.
  paddingBottom: "96px",
};
