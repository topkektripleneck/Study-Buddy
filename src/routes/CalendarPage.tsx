import { ScheduleView } from "@/views/ScheduleView";
import { ZodiacBackdrop } from "@/components/ZodiacBackdrop";
import { PressableEnergy } from "@/ui/kit";
import { openWindow } from "@/lib/windows";

export function CalendarPage() {
  return (
    <div style={page} className="sb-themed-page">
      <ZodiacBackdrop />
      <div className="sb-themed-page__content">
        <header style={header}>
          <div>
            <p style={eyebrow}>Secondary Window</p>
            <h1 style={title}>Calendar</h1>
          </div>
          <PressableEnergy variant="ghost" onClick={() => openWindow("main")}>
            Focus Workspace
          </PressableEnergy>
        </header>
        <ScheduleView />
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
  alignItems: "flex-end",
  marginBottom: "var(--sb-space-md)",
};

const eyebrow = {
  margin: 0,
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--sb-text-muted)",
};

const title = {
  margin: "4px 0 0",
  fontSize: "22px",
};
