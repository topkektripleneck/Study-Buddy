import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ConsistencyMetric, TimerTickPayload } from "@/types";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useTimer() {
  const [tick, setTick] = useState<TimerTickPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const current = await api.timerGet();
      if (!cancelled && current) setTick(current);

      const channel = new Channel<TimerTickPayload>();
      channel.onmessage = (msg) => setTick(msg);
      await api.timerSubscribe(channel);

      const unlisten = await listen<TimerTickPayload>("timer:tick", (event) => {
        setTick(event.payload);
      });

      return () => {
        unlisten();
      };
    }

    const cleanup = init();
    return () => {
      cancelled = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  const displayTime = tick
    ? tick.phase === "stopwatch" || tick.remainingMs === null
      ? formatMs(tick.elapsedMs)
      : formatMs(tick.remainingMs ?? tick.elapsedMs)
    : "25:00";

  const isRunning = tick?.runState === "running";
  const isPaused = tick?.runState === "paused";
  const isIdle = !tick || tick.runState === "idle";

  return {
    tick,
    displayTime,
    isRunning,
    isPaused,
    isIdle,
    start: useCallback(
      (protocol?: string, durationMinutes?: number) =>
        api.timerStart(protocol, durationMinutes),
      [],
    ),
    pause: useCallback(() => api.timerPause(), []),
    resume: useCallback(() => api.timerResume(), []),
    reset: useCallback(() => api.timerReset(), []),
    skipPhase: useCallback(() => api.timerSkipPhase(), []),
  };
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<ConsistencyMetric | null>(null);

  const refresh = useCallback(async () => {
    setMetrics(await api.metricsGet());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    const unlisten = listen<ConsistencyMetric>("metrics:changed", (event) => {
      setMetrics(event.payload);
    });

    return () => {
      clearInterval(id);
      unlisten.then((u) => u());
    };
  }, [refresh]);

  return { metrics, refresh };
}
