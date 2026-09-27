import { invoke } from "@tauri-apps/api/core";

export type WindowLabel = "main" | "calendar" | "hud" | "toast";

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

export async function openWindow(label: WindowLabel): Promise<void> {
  if (!hasTauri()) {
    if (label === "calendar") {
      window.open("#/calendar", "_blank");
    }
    return;
  }
  await invoke<void>("window_open", { label }).catch(() => {});
}

export async function closeWindow(label: WindowLabel): Promise<void> {
  if (!hasTauri()) return;
  await invoke<void>("window_close", { label }).catch(() => {});
}

export async function toggleWindow(label: WindowLabel): Promise<boolean> {
  if (!hasTauri()) {
    if (label === "calendar") {
      window.open("#/calendar", "_blank");
      return true;
    }
    return false;
  }
  try {
    return await invoke<boolean>("window_toggle", { label });
  } catch {
    return false;
  }
}

export async function isWindowOpen(label: WindowLabel): Promise<boolean> {
  if (!hasTauri()) return false;
  try {
    return await invoke<boolean>("window_is_open", { label });
  } catch {
    return false;
  }
}
