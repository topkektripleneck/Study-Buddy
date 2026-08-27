import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowLabel = "main" | "calendar" | "hud";

export async function openWindow(label: WindowLabel): Promise<void> {
  await invoke("window_open", { label });
}

export async function getCurrentWindowLabel(): Promise<WindowLabel> {
  const label = getCurrentWindow().label;
  if (label === "calendar" || label === "hud") {
    return label;
  }
  return "main";
}
