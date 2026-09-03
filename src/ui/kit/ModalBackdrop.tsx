import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Surface } from "./Surface";

export interface ModalBackdropProps {
  children: ReactNode;
  onClose?: () => void;
  panelStyle?: CSSProperties;
  panelClassName?: string;
  backdropStyle?: CSSProperties;
}

export function ModalBackdrop({
  children,
  onClose,
  panelStyle,
  panelClassName,
  backdropStyle,
}: ModalBackdropProps) {
  useEffect(() => {
    if (!onClose) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
        className={["sb-glass sb-modal-panel", panelClassName].filter(Boolean).join(" ")}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Surface>
    </div>
  );
}
