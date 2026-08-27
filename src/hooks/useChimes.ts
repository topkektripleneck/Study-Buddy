import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { playChime } from "@/lib/chimes";

interface TimerPhaseEvent {
  from?: string | null;
  to: string;
}

export function useChimes() {
  useEffect(() => {
    let config = { focusStartChimePath: null as string | null, focusEndChimePath: null as string | null };
    api.configGet().then((c) => {
      config = {
        focusStartChimePath: c.focusStartChimePath ?? null,
        focusEndChimePath: c.focusEndChimePath ?? null,
      };
    });

    const unlistenConfig = listen("config:changed", () => {
      api.configGet().then((c) => {
        config = {
          focusStartChimePath: c.focusStartChimePath ?? null,
          focusEndChimePath: c.focusEndChimePath ?? null,
        };
      });
    });

    const unlistenPhase = listen<TimerPhaseEvent>("timer:phase", (event) => {
      const { from, to } = event.payload;
      if (to === "focus") {
        void playChime(config.focusStartChimePath);
      } else if (from === "focus" && to !== "focus") {
        void playChime(config.focusEndChimePath);
      }
    });

    return () => {
      unlistenConfig.then((u) => u());
      unlistenPhase.then((u) => u());
    };
  }, []);
}
