import { useSyncExternalStore } from "react";
import { STARFIELD } from "@/lib/zodiacArt";
import { ZODIAC_OPTIONS } from "@/lib/themes";
import { subscribeThemeAttrs, readActiveZodiacSign } from "@/lib/themeStore";

/** Renders inside `.sb-main-page` / `.sb-themed-page` — not at App root. */
export function ZodiacBackdrop() {
  const sign = useSyncExternalStore(
    subscribeThemeAttrs,
    readActiveZodiacSign,
    () => null,
  );

  if (!sign || !ZODIAC_OPTIONS.some((z) => z.id === sign)) return null;

  return (
    <div className="sb-zodiac-backdrop" aria-hidden>
      <div className="sb-zodiac-backdrop__nebula" />
      <svg
        className="sb-zodiac-backdrop__sky"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden
      >
        {STARFIELD.map((star, i) => (
          <circle
            key={i}
            cx={star.x * 1000}
            cy={star.y * 1000}
            r={star.r}
            opacity={star.o}
            className={`sb-zodiac-backdrop__sky-star ${i % 4 === 0 ? "sb-zodiac-star--twinkle" : ""}`}
            style={
              i % 4 === 0
                ? {
                    animationDelay: `${star.twinkleDelay}s`,
                    animationDuration: `${star.twinkleDuration}s`,
                  }
                : undefined
            }
          />
        ))}
      </svg>
    </div>
  );
}
