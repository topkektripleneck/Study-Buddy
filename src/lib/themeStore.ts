import { safeListen } from "@/lib/safeListen";
import {
  EIGHTBIT_PALETTE_OPTIONS,
  THEME_OPTIONS,
  ZODIAC_OPTIONS,
  applyTheme,
  type EightbitPalette,
  type ThemeId,
  type ZodiacSign,
} from "@/lib/themes";

type ThemeSnapshot = {
  themeId: ThemeId;
  zodiacSign: ZodiacSign;
  eightbitPalette: EightbitPalette;
};

let lastKey = "";

function themeKey(config: {
  themeId?: ThemeId | string;
  zodiacSign?: ZodiacSign | string;
  eightbitPalette?: EightbitPalette | string;
}): string {
  return `${config.themeId ?? "galaxy"}:${config.zodiacSign ?? "leo"}:${config.eightbitPalette ?? "green"}`;
}

/** Apply only when theme fields actually changed — avoids switch flicker. */
export function applyThemeFromConfig(config: {
  themeId?: ThemeId | string;
  zodiacSign?: ZodiacSign | string;
  eightbitPalette?: EightbitPalette | string;
}): void {
  const key = themeKey(config);
  if (key === lastKey) return;
  lastKey = key;
  applyTheme(config);
}

export function readActiveZodiacSign(): ZodiacSign | null {
  const root = document.documentElement;
  if (root.dataset.theme !== "astrology") return null;
  const sign = root.dataset.sign as ZodiacSign | undefined;
  return ZODIAC_OPTIONS.some((z) => z.id === sign) ? sign! : "leo";
}

export function readThemeSnapshot(): ThemeSnapshot {
  const root = document.documentElement;
  const themeId = THEME_OPTIONS.some((t) => t.id === root.dataset.theme)
    ? (root.dataset.theme as ThemeId)
    : "galaxy";
  const zodiacSign = ZODIAC_OPTIONS.some((z) => z.id === root.dataset.sign)
    ? (root.dataset.sign as ZodiacSign)
    : "leo";
  const eightbitPalette = EIGHTBIT_PALETTE_OPTIONS.some((p) => p.id === root.dataset.eightbitPalette)
    ? (root.dataset.eightbitPalette as EightbitPalette)
    : "green";
  return { themeId, zodiacSign, eightbitPalette };
}

const listeners = new Set<() => void>();

function notifyThemeListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeThemeAttrs(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-sign", "data-eightbit-palette"],
  });

  const off = safeListen("config:changed", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    observer.disconnect();
    off();
  };
}

export function bumpThemeStore(): void {
  notifyThemeListeners();
}
