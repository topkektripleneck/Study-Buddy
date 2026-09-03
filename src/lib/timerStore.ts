import { Channel } from "@tauri-apps/api/core";
import { api } from "@/lib/api";
import { safeListen } from "@/lib/safeListen";
import type { ConsistencyMetric, TimerTickPayload } from "@/types";

type TimerListener = (tick: TimerTickPayload | null) => void;
type MetricsListener = (metrics: ConsistencyMetric | null) => void;

let timerTick: TimerTickPayload | null = null;
let metrics: ConsistencyMetric | null = null;
let timerReady = false;
let metricsReady = false;
let metricsRevision = 0;

const timerListeners = new Set<TimerListener>();
const metricsListeners = new Set<MetricsListener>();

function emitTimer() {
  for (const listener of timerListeners) listener(timerTick);
}

function emitMetrics() {
  for (const listener of metricsListeners) listener(metrics);
}

async function ensureTimer() {
  if (timerReady) return;
  timerReady = true;
  const current = await api.timerGet();
  timerTick = current;
  emitTimer();

  const channel = new Channel<TimerTickPayload>();
  channel.onmessage = (msg) => {
    timerTick = msg;
    emitTimer();
  };
  await api.timerSubscribe(channel);
}

async function ensureMetrics() {
  if (metricsReady) return;
  metricsReady = true;
  const rev = ++metricsRevision;
  metrics = await api.metricsGet();
  if (rev === metricsRevision) emitMetrics();

  setInterval(async () => {
    const r = ++metricsRevision;
    const next = await api.metricsGet();
    if (r === metricsRevision) {
      metrics = next;
      emitMetrics();
    }
  }, 60_000);

  safeListen<ConsistencyMetric>("metrics:changed", (event) => {
    metricsRevision += 1;
    metrics = event.payload;
    emitMetrics();
  });
}

export function subscribeTimer(listener: TimerListener): () => void {
  timerListeners.add(listener);
  listener(timerTick);
  void ensureTimer();
  return () => timerListeners.delete(listener);
}

export function subscribeMetrics(listener: MetricsListener): () => void {
  metricsListeners.add(listener);
  listener(metrics);
  void ensureMetrics();
  return () => metricsListeners.delete(listener);
}

export function formatTimerMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
