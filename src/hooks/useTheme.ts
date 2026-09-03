import { useEffect } from "react";
import { api } from "@/lib/api";
import { applyThemeFromConfig, bumpThemeStore } from "@/lib/themeStore";
import { safeListen } from "@/lib/safeListen";

export function useTheme() {
  useEffect(() => {
    let active = true;

    api.configGet().then((config) => {
      if (!active) return;
      applyThemeFromConfig(config);
      bumpThemeStore();
    });

    const off = safeListen("config:changed", () => {
      api.configGet().then((config) => {
        if (!active) return;
        applyThemeFromConfig(config);
        bumpThemeStore();
      });
    });

    return () => {
      active = false;
      off();
    };
  }, []);
}
