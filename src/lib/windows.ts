import { invoke } from "@tauri-apps/api/core";

export type WindowLabel = "main" | "calendar" | "hud";

export async function openWindow(label: WindowLabel): Promise<void> {
  await invoke<void>("window_open", { label });
}

export async function closeWindow(label: WindowLabel): Promise<void> {
  await invoke<void>("window_close", { label });
}

export async function toggleWindow(label: WindowLabel): Promise<boolean> {
  return invoke<boolean>("window_toggle", { label });
}

export async function isWindowOpen(label: WindowLabel): Promise<boolean> {
  return invoke<boolean>("window_is_open", { label });
}
