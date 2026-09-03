import { WIDGET_CATALOG, type WidgetId } from "@/types";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

interface WidgetLibraryProps {
  active: WidgetId[];
  onAdd: (id: WidgetId) => void;
  onClose: () => void;
}

export function WidgetLibrary({ active, onAdd, onClose }: WidgetLibraryProps) {
  return (
    <ModalBackdrop onClose={onClose} panelStyle={panel}>
      <h2 style={title}>Widget Library</h2>
      <p style={subtitle}>Choose from widget library — keeps getting added.</p>
      <div style={grid}>
        {WIDGET_CATALOG.map((w) => (
          <button
            key={w.id}
            type="button"
            className="sb-pressable sb-pressable-hover"
            style={{
              ...card,
              ...(active.includes(w.id) ? cardDisabled : {}),
            }}
            disabled={active.includes(w.id)}
            onClick={() => onAdd(w.id)}
          >
            <span style={plus}>+</span>
            <strong>{w.label}</strong>
            <span style={desc}>{w.description}</span>
          </button>
        ))}
      </div>
      <PressableEnergy variant="ghost" onClick={onClose}>
        Close
      </PressableEnergy>
    </ModalBackdrop>
  );
}

const panel = {
  width: "min(640px, 92vw)",
  maxHeight: "80vh",
  overflow: "auto",
};

const title = {
  margin: "0 0 4px",
  fontSize: "20px",
  lineHeight: 1.15,
  letterSpacing: "var(--sb-tracking-tight)",
};
const subtitle = { margin: "0 0 16px", color: "var(--sb-text-secondary)" };
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: "12px",
  marginBottom: "16px",
};
const card = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: "6px",
  padding: "16px",
  borderRadius: "var(--sb-radius-md)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  cursor: "pointer",
  textAlign: "center" as const,
};
const cardDisabled = {
  opacity: 0.45,
  cursor: "not-allowed" as const,
};
const plus = { fontSize: "28px", color: "var(--sb-accent)" };
const desc = { fontSize: "11px", color: "var(--sb-text-muted)" };
