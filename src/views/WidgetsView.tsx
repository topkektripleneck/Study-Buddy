import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BreathingWidget } from "@/components/BreathingWidget";
import { CheatsheetWidget } from "@/components/CheatsheetWidget";
import { ClockWidget } from "@/components/ClockWidget";
import { FocusWidget } from "@/components/FocusWidget";
import { TargetRingWidget } from "@/components/TargetRingWidget";
import { TasksWidget } from "@/components/TasksWidget";
import { EnergyWidget } from "@/components/EnergyWidget";
import { JournalWidget } from "@/components/JournalWidget";
import { VentWidget } from "@/components/VentWidget";
import { WidgetLibrary } from "@/components/WidgetLibrary";
import { ZodiacArtworkBox } from "@/components/ZodiacArtworkBox";
import { api } from "@/lib/api";
import { useListen } from "@/hooks/useListen";
import { WIDGET_CATALOG, parseWidgetIds, type WidgetId } from "@/types";
import { GlowBorder, KineticStack, PressableEnergy } from "@/ui/kit";

const WIDGET_MAP: Record<WidgetId, () => ReactElement> = {
  focus: FocusWidget,
  clock: ClockWidget,
  tasks: TasksWidget,
  target: TargetRingWidget,
  cheatsheet: CheatsheetWidget,
  breathing: BreathingWidget,
  energy: EnergyWidget,
  journal: JournalWidget,
  vent: VentWidget,
};

function SortableWidgetSlot({
  id,
  label,
  children,
  onRemove,
}: {
  id: WidgetId;
  label: string;
  children: ReactElement;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        ...slot,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      <button
        type="button"
        className="sb-widget-drag-handle sb-pressable"
        aria-label={`Drag ${label}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
      <button
        type="button"
        className="sb-pressable sb-pressable-hover"
        style={removeButton}
        onClick={onRemove}
        title={`Remove ${label}`}
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    </div>
  );
}

export function WidgetsView() {
  const [widgetIds, setWidgetIds] = useState<WidgetId[]>(["focus", "clock"]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [activeId, setActiveId] = useState<WidgetId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const refreshLayout = useCallback(async () => {
    const layout = await api.layoutGet();
    setWidgetIds(parseWidgetIds(layout.widgetIds));
  }, []);

  useEffect(() => {
    refreshLayout();
  }, [refreshLayout]);

  useListen(refreshLayout, "layout:changed");

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

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as WidgetId);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgetIds.indexOf(active.id as WidgetId);
    const newIndex = widgetIds.indexOf(over.id as WidgetId);
    if (oldIndex === -1 || newIndex === -1) return;
    saveWidgets(arrayMove(widgetIds, oldIndex, newIndex));
  }

  const activeLabel =
    activeId != null
      ? (WIDGET_CATALOG.find((w) => w.id === activeId)?.label ?? activeId)
      : null;

  return (
    <div>
      <KineticStack direction="row" gap="sm" style={{ marginBottom: "var(--sb-space-md)" }}>
        <PressableEnergy onClick={() => setLibraryOpen(true)}>Widgets</PressableEnergy>
        <span style={hint}>Drag ⠿ to reorder</span>
      </KineticStack>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
          <div className="sb-widgets-grid" style={grid}>
            {widgetIds.map((id) => {
              const Widget = WIDGET_MAP[id];
              if (!Widget) return null;
              const label = WIDGET_CATALOG.find((w) => w.id === id)?.label ?? id;
              return (
                <SortableWidgetSlot
                  key={id}
                  id={id}
                  label={label}
                  onRemove={() => removeWidget(id)}
                >
                  <Widget />
                </SortableWidgetSlot>
              );
            })}

            <GlowBorder tone="warm">
              <button
                style={addCard}
                className="sb-pressable sb-pressable-hover sb-widget-add-card"
                onClick={() => setLibraryOpen(true)}
                type="button"
              >
                <span style={plus}>+</span>
                <span>Add widget</span>
              </button>
            </GlowBorder>
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && activeLabel ? (
            <div style={{ ...slot, opacity: 0.85, boxShadow: "0 8px 28px rgba(0,0,0,0.5)" }}>
              <div
                style={{
                  padding: "24px",
                  background: "var(--sb-bg-raised)",
                  border: "1px solid var(--sb-border-glow)",
                  borderRadius: "var(--sb-radius-md)",
                  color: "var(--sb-text-secondary)",
                  fontSize: "14px",
                }}
              >
                {activeLabel}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {libraryOpen && (
        <WidgetLibrary
          active={widgetIds}
          onAdd={addWidget}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      <ZodiacArtworkBox />
    </div>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "var(--sb-space-md)",
} as const;

const slot = { position: "relative" as const };

const hint = {
  fontSize: "12px",
  color: "var(--sb-text-muted)",
  alignSelf: "center",
};

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
  background: "color-mix(in srgb, var(--sb-bg-raised) 25%, transparent)",
  backdropFilter: "blur(16px) saturate(150%)",
  WebkitBackdropFilter: "blur(16px) saturate(150%)",
  border: "1px dashed color-mix(in srgb, var(--sb-border-subtle) 80%, var(--sb-accent) 20%)",
  borderRadius: "calc(var(--sb-radius-md) - 1px)",
  color: "var(--sb-text-secondary)",
  cursor: "pointer",
};

const plus = {
  fontSize: "32px",
  color: "var(--sb-accent)",
  lineHeight: 1,
};
