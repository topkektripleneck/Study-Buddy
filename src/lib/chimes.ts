import { convertFileSrc } from "@tauri-apps/api/core";

let lastPlayedAt = 0;

export async function playChime(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const now = Date.now();
  if (now - lastPlayedAt < 400) return;
  lastPlayedAt = now;

  try {
    const audio = new Audio(convertFileSrc(path));
    audio.volume = 0.85;
    await audio.play();
  } catch {
    // Missing file or unsupported codec — skip silently
  }
}
