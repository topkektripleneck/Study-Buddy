import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Tags each webview so auxiliary windows (HUD, toast) skip main-workspace chrome. */export function initWindowShell(): void {
  document.documentElement.dataset.window = getCurrentWebviewWindow().label;
}

export function useWindowShell() {
  useEffect(() => {
    initWindowShell();
    return () => {
      delete document.documentElement.dataset.window;
    };
  }, []);
}
