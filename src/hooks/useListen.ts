import { useEffect } from "react";
import { safeListen } from "@/lib/safeListen";

export function useListen(onEvent: () => void, ...events: string[]) {
  const key = events.join("\0");
  useEffect(() => {
    const offs = events.map((event) => safeListen(event, onEvent));
    return () => offs.forEach((off) => off());
    // events list is keyed by join — rest args are stable per callsite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent, key]);
}
