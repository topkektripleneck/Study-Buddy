import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Tags each webview so auxiliary windows (HUD, toast) skip main-workspace chrome. */
export function initWindowShell(): void {
  try {
    document.documentElement.dataset.window = getCurrentWebviewWindow().label;
  } catch {
    // Fallback when running outside Tauri or before webview metadata is ready
    document.documentElement.dataset.window = "main";
  }
}

export function useWindowShell() {
  useEffect(() => {
    initWindowShell();
    return () => {
      delete document.documentElement.dataset.window;
    };
  }, []);
}
