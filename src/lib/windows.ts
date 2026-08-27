import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowLabel = "main" | "calendar" | "hud";

export async function openWindow(label: WindowLabel): Promise<void> {
  await invoke("window_open", { label });
}

export async function closeWindow(label: WindowLabel): Promise<void> {
  await invoke("window_close", { label });
}

export async function toggleWindow(label: WindowLabel): Promise<boolean> {
  return invoke<boolean>("window_toggle", { label });
}

export async function isWindowOpen(label: WindowLabel): Promise<boolean> {
  return invoke<boolean>("window_is_open", { label });
}

export async function getCurrentWindowLabel(): Promise<WindowLabel> {
  const label = getCurrentWindow().label;
  if (label === "calendar" || label === "hud") {
    return label;
  }
  return "main";
}
