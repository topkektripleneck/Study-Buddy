import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { BreathingWidget } from "@/components/BreathingWidget";
import { CheatsheetWidget } from "@/components/CheatsheetWidget";
import { ClockWidget } from "@/components/ClockWidget";
import { FocusWidget } from "@/components/FocusWidget";
import { HeatmapWidget } from "@/components/HeatmapWidget";
import { TargetRingWidget } from "@/components/TargetRingWidget";
import { TasksWidget } from "@/components/TasksWidget";
import { VentWidget } from "@/components/VentWidget";
import { WidgetLibrary } from "@/components/WidgetLibrary";
import { api } from "@/lib/api";
import { WIDGET_CATALOG, parseWidgetIds, type WidgetId } from "@/types";
import { GlowBorder, KineticStack, PressableEnergy } from "@/ui/kit";

const WIDGET_MAP: Record<WidgetId, () => ReactElement> = {
  focus: FocusWidget,
  clock: ClockWidget,
  tasks: TasksWidget,
  heatmap: HeatmapWidget,
  target: TargetRingWidget,
  cheatsheet: CheatsheetWidget,
  breathing: BreathingWidget,
  vent: VentWidget,
};

export function WidgetsView() {
  const [widgetIds, setWidgetIds] = useState<WidgetId[]>(["focus", "clock"]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    api.layoutGet().then((layout) => {
      setWidgetIds(parseWidgetIds(layout.widgetIds));
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

  function removeWidget(id: WidgetId) {
    saveWidgets(widgetIds.filter((widgetId) => widgetId !== id));
  }

  return (
    <div>
      <KineticStack direction="row" gap="sm" style={{ marginBottom: "var(--sb-space-md)" }}>
        <PressableEnergy onClick={() => setLibraryOpen(true)}>Widgets</PressableEnergy>
      </KineticStack>

      <div style={grid}>
        {widgetIds.map((id) => {
          const Widget = WIDGET_MAP[id];
          if (!Widget) return null;
          const label = WIDGET_CATALOG.find((w) => w.id === id)?.label ?? id;
          return (
            <div key={id} style={slot}>
              <Widget />
              <button
                type="button"
                className="sb-pressable"
                style={removeButton}
                onClick={() => removeWidget(id)}
                title={`Remove ${label}`}
                aria-label={`Remove ${label}`}
              >
                ×
              </button>
            </div>
          );
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

const slot = { position: "relative" as const };

const removeButton = {
  position: "absolute" as const,
  top: "6px",
  right: "6px",
  width: "22px",
  height: "22px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--sb-text-muted)",
  fontSize: "16px",
  lineHeight: 1,
};

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
