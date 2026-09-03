import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";

/** Unmount-safe listener — cleans up even if `listen()` resolves after unmount. */
export function safeListen<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let disposed = false;
  let unlisten: UnlistenFn | null = null;

  listen(event, handler).then((u) => {
    if (disposed) u();
    else unlisten = u;
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}
