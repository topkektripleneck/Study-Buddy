import { useEffect, useState } from "react";
import { formatTimerMs, subscribeMetrics, subscribeTimer } from "@/lib/timerStore";
import type { ConsistencyMetric, TimerTickPayload } from "@/types";

export function useTimer() {
  const [tick, setTick] = useState<TimerTickPayload | null>(null);

  useEffect(() => subscribeTimer(setTick), []);

  const displayTime = tick
    ? tick.phase === "stopwatch" || tick.remainingMs === null
      ? formatTimerMs(tick.elapsedMs)
      : formatTimerMs(tick.remainingMs ?? tick.elapsedMs)
    : "00:00";

  return {
    tick,
    displayTime,
    isRunning: tick?.runState === "running",
    isPaused: tick?.runState === "paused",
    isIdle: !tick || tick.runState === "idle",
  };
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<ConsistencyMetric | null>(null);

  useEffect(() => subscribeMetrics(setMetrics), []);

  return { metrics, refresh: async () => setMetrics(await import("@/lib/api").then((m) => m.api.metricsGet())) };
}
