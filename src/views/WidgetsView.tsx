import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ClockWidget } from "@/components/ClockWidget";
import { FocusWidget } from "@/components/FocusWidget";
import { HeatmapWidget } from "@/components/HeatmapWidget";
import { TasksWidget } from "@/components/TasksWidget";
import { WidgetLibrary } from "@/components/WidgetLibrary";
import { api } from "@/lib/api";
import type { WidgetId } from "@/types";
import { GlowBorder, KineticStack, PressableEnergy } from "@/ui/kit";

const WIDGET_MAP: Record<WidgetId, () => ReactElement> = {
  focus: FocusWidget,
  clock: ClockWidget,
  tasks: TasksWidget,
  heatmap: HeatmapWidget,
};

export function WidgetsView() {
  const [widgetIds, setWidgetIds] = useState<WidgetId[]>(["focus", "clock"]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    api.layoutGet().then((layout) => {
      setWidgetIds(layout.widgetIds as WidgetId[]);
    });
  }, []);

  async function saveWidgets(ids: WidgetId[]) {
    setWidgetIds(ids);
    await api.layoutSave({ schemaVersion: 1, widgetIds: ids });
  }

  function addWidget(id: WidgetId) {
    if (widgetIds.includes(id)) return;
    saveWidgets([...widgetIds, id]);
    setLibraryOpen(false);
  }

  return (
    <div>
      <KineticStack direction="row" gap="sm" style={{ marginBottom: "var(--sb-space-md)" }}>
        <PressableEnergy onClick={() => setLibraryOpen(true)}>Widgets</PressableEnergy>
      </KineticStack>

      <div style={grid}>
        {widgetIds.map((id) => {
          const Widget = WIDGET_MAP[id];
          return Widget ? <Widget key={id} /> : null;
        })}

        <GlowBorder tone="warm">
          <button style={addCard} onClick={() => setLibraryOpen(true)} type="button">
            <span style={plus}>+</span>
            <span>Add widget</span>
          </button>
        </GlowBorder>
      </div>

      {libraryOpen && (
        <WidgetLibrary
          active={widgetIds}
          onAdd={addWidget}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "var(--sb-space-md)",
} as const;

const addCard = {
  width: "100%",
  minHeight: "160px",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  background: "var(--sb-bg-raised)",
  border: "none",
  borderRadius: "calc(var(--sb-radius-md) - 1px)",
  color: "var(--sb-text-secondary)",
  cursor: "pointer",
};

const plus = {
  fontSize: "32px",
  color: "var(--sb-accent)",
  lineHeight: 1,
};
