import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export function useListen(onEvent: () => void, ...events: string[]) {
  const key = events.join("\0");
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    for (const event of events) {
      listen(event, onEvent).then((u) => unsubs.push(u));
    }
    return () => unsubs.forEach((u) => u());
    // events list is keyed by join — rest args are stable per callsite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent, key]);
}
