import { convertFileSrc } from "@tauri-apps/api/core";

let lastPlayedAt = 0;
let stopwatchAudio: AudioContext | null = null;

/** Short built-in cue so the stopwatch works without a custom audio file. */
export async function playStopwatchChime(path: string | null | undefined, finished = false) {
  if (path) return playChime(path);
  try {
    stopwatchAudio ??= new AudioContext();
    await stopwatchAudio.resume();
    const oscillator = stopwatchAudio.createOscillator();
    const gain = stopwatchAudio.createGain();
    const start = stopwatchAudio.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(finished ? 660 : 440, start);
    oscillator.frequency.exponentialRampToValueAtTime(finished ? 440 : 660, start + 0.18);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    oscillator.connect(gain);
    gain.connect(stopwatchAudio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.42);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch (error) {
    console.error("Could not play stopwatch sound", error);
  }
}

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
