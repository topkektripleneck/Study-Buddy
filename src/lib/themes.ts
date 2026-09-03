export type ThemeId = "galaxy" | "astrology" | "eightbit";

export type ZodiacSign =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

export type EightbitPalette = "green" | "cyan" | "amber" | "magenta";

export const THEME_OPTIONS: {
  id: ThemeId;
  label: string;
  hint: string;
  swatch: [string, string, string];
}[] = [
  {
    id: "galaxy",
    label: "Galaxy",
    hint: "Cosmic night sky with soft violet glows",
    swatch: ["#070b14", "#7b9cff", "#c084fc"],
  },
  {
    id: "astrology",
    label: "Astrology",
    hint: "Background and accents from your zodiac sign",
    swatch: ["#0f0818", "#f5c451", "#a855f7"],
  },
  {
    id: "eightbit",
    label: "8-bit",
    hint: "Retro palette — sharp corners, standard type",
    swatch: ["#1a1a2e", "#39ff14", "#ff4757"],
  },
];

export const ZODIAC_OPTIONS: { id: ZodiacSign; label: string }[] = [
  { id: "aries", label: "♈ Aries" },
  { id: "taurus", label: "♉ Taurus" },
  { id: "gemini", label: "♊ Gemini" },
  { id: "cancer", label: "♋ Cancer" },
  { id: "leo", label: "♌ Leo" },
  { id: "virgo", label: "♍ Virgo" },
  { id: "libra", label: "♎ Libra" },
  { id: "scorpio", label: "♏ Scorpio" },
  { id: "sagittarius", label: "♐ Sagittarius" },
  { id: "capricorn", label: "♑ Capricorn" },
  { id: "aquarius", label: "♒ Aquarius" },
  { id: "pisces", label: "♓ Pisces" },
];

export const EIGHTBIT_PALETTE_OPTIONS: {
  id: EightbitPalette;
  label: string;
  swatch: string;
}[] = [
  { id: "green", label: "Green", swatch: "#00ff88" },
  { id: "cyan", label: "Cyan", swatch: "#00e5ff" },
  { id: "amber", label: "Amber", swatch: "#ffb000" },
  { id: "magenta", label: "Magenta", swatch: "#ff44cc" },
];

export function applyTheme(config: {
  themeId?: ThemeId | string;
  zodiacSign?: ZodiacSign | string;
  eightbitPalette?: EightbitPalette | string;
}) {
  const root = document.documentElement;

  const themeId = THEME_OPTIONS.some((t) => t.id === config.themeId)
    ? (config.themeId as ThemeId)
    : "galaxy";

  delete root.dataset.sign;
  delete root.dataset.eightbitPalette;
  root.dataset.theme = themeId;

  if (themeId === "astrology") {
    const sign = ZODIAC_OPTIONS.some((z) => z.id === config.zodiacSign)
      ? (config.zodiacSign as ZodiacSign)
      : "leo";
    root.dataset.sign = sign;
  }

  if (themeId === "eightbit") {
    const palette = EIGHTBIT_PALETTE_OPTIONS.some((p) => p.id === config.eightbitPalette)
      ? (config.eightbitPalette as EightbitPalette)
      : "green";
    root.dataset.eightbitPalette = palette;
  }
}
