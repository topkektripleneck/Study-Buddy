import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { playChime } from "@/lib/chimes";
import { safeListen } from "@/lib/safeListen";

interface TimerPhaseEvent {
  from?: string | null;
  to: string;
}

export function useChimes() {
  useEffect(() => {
    if (getCurrentWebviewWindow().label !== "main") return;

    let config = { focusStartChimePath: null as string | null, focusEndChimePath: null as string | null };
    api.configGet().then((c) => {
      config = {
        focusStartChimePath: c.focusStartChimePath ?? null,
        focusEndChimePath: c.focusEndChimePath ?? null,
      };
    });

    const offConfig = safeListen("config:changed", () => {
      api.configGet().then((c) => {
        config = {
          focusStartChimePath: c.focusStartChimePath ?? null,
          focusEndChimePath: c.focusEndChimePath ?? null,
        };
      });
    });

    const offPhase = safeListen<TimerPhaseEvent>("timer:phase", (event) => {
      const { from, to } = event.payload;
      if (to === "focus") {
        void playChime(config.focusStartChimePath);
      } else if (from === "focus" && to !== "focus") {
        void playChime(config.focusEndChimePath);
      }
    });

    return () => {
      offConfig();
      offPhase();
    };
  }, []);
}
