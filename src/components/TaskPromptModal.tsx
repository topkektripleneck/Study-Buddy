import type { CalendarTimeBlock } from "@/types";
import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

interface TaskPromptModalProps {
  block: CalendarTimeBlock;
  onConfirm: (createTask: boolean) => void;
}

export function TaskPromptModal({ block, onConfirm }: TaskPromptModalProps) {
  return (
    <ModalBackdrop
      onClose={() => onConfirm(false)}
      backdropStyle={{ zIndex: 110 }}
      panelStyle={panel}
    >
      <h2 style={heading}>Create a task for this block?</h2>
      <p style={body}>
        Add a linked task for <strong>{block.title}</strong> in the sidebar?
        You can turn this prompt off in Settings.
      </p>
      <div style={actions}>
        <PressableEnergy onClick={() => onConfirm(true)}>Yes, add task</PressableEnergy>
        <PressableEnergy variant="ghost" onClick={() => onConfirm(false)}>
          No thanks
        </PressableEnergy>
      </div>
    </ModalBackdrop>
  );
}

const panel = { width: "min(400px, 92vw)" };
const heading = { margin: "0 0 8px", fontSize: "18px" };
const body = { margin: "0 0 16px", color: "var(--sb-text-secondary)", lineHeight: 1.5 };
const actions = { display: "flex", gap: "8px" };
