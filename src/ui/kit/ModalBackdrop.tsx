import type { CSSProperties, ReactNode } from "react";
import { Surface } from "./Surface";

export interface ModalBackdropProps {
  children: ReactNode;
  onClose?: () => void;
  panelStyle?: CSSProperties;
  backdropStyle?: CSSProperties;
}

export function ModalBackdrop({
  children,
  onClose,
  panelStyle,
  backdropStyle,
}: ModalBackdropProps) {
  return (
    <div
      className="sb-modal-backdrop"
      style={backdropStyle}
      onClick={onClose}
      role="presentation"
    >
      <Surface
        padding="lg"
        variant="overlay"
        className="sb-glass sb-modal-panel"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Surface>
    </div>
  );
}
