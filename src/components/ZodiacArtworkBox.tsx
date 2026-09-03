import { useSyncExternalStore } from "react";
import { ZODIAC_OPTIONS } from "@/lib/themes";
import { readActiveZodiacSign, subscribeThemeAttrs } from "@/lib/themeStore";
import { ZODIAC_ARTWORKS } from "@/lib/zodiacImages";

export function ZodiacArtworkBox() {
  const sign = useSyncExternalStore(
    subscribeThemeAttrs,
    readActiveZodiacSign,
    () => null,
  );

  if (!sign || !ZODIAC_OPTIONS.some((z) => z.id === sign)) return null;

  const artwork = ZODIAC_ARTWORKS[sign];

  if (!artwork) return null;

  return (
    <div style={wrap} aria-label={`${sign} artwork`}>
      <img
        key={sign}
        src={artwork.image}
        alt={artwork.title ?? `${sign} artwork`}
        className="sb-zodiac-art-img"
        style={artworkImg}
        draggable={false}
        decoding="async"
        loading="eager"
      />
    </div>
  );
}

const wrap = {
  position: "fixed" as const,
  bottom: "64px",
  right: "24px",
  zIndex: 40,
  width: "170px",
  pointerEvents: "none" as const,
  userSelect: "none" as const,
};

const artworkImg = {
  width: "100%",
  height: "auto",
  maxHeight: "260px",
  objectFit: "contain" as const,
  display: "block",
  borderRadius: "10px",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.65)",
};
