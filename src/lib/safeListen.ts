import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";

/** Unmount-safe listener — cleans up even if `listen()` resolves after unmount. */
export function safeListen<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let disposed = false;
  let unlisten: UnlistenFn | null = null;

  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ) {
      listen(event, handler)
        .then((u) => {
          if (disposed) u();
          else unlisten = u;
        })
        .catch(() => {});
    }
  } catch {
    // Gracefully ignore in non-Tauri preview environments
  }

  return () => {
    disposed = true;
    unlisten?.();
  };
}
