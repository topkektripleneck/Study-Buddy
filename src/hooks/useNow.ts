import { useEffect, useState } from "react";

/**
 * Ticking wall clock. Default cadence is fine for minute-resolution UI such as
 * the schedule marker; pass a smaller interval for second-resolution displays.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
