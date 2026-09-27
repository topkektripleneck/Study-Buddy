import { useSyncExternalStore } from "react";
import { STARFIELD } from "@/lib/zodiacArt";
import { ZODIAC_OPTIONS } from "@/lib/themes";
import { subscribeThemeAttrs, readActiveZodiacSign } from "@/lib/themeStore";

function SkyStar({ star, index }: { star: (typeof STARFIELD)[number]; index: number }) {
  const x = star.x * 1000;
  const y = star.y * 1000;
  const twinkles = index % 4 === 0 || star.kind === "cross";
  const className = [
    "sb-zodiac-backdrop__sky-star",
    `sb-zodiac-star--${star.kind}`,
    `sb-zodiac-star--${star.tone}`,
    twinkles ? "sb-zodiac-star--twinkle" : "",
  ].filter(Boolean).join(" ");
  const style = twinkles
    ? {
        animationDelay: `${star.twinkleDelay}s`,
        animationDuration: `${star.twinkleDuration}s`,
      }
    : undefined;

  if (star.kind === "diamond") {
    const vertical = star.r * 2.4;
    const horizontal = star.r * 1.25;
    return (
      <path
        d={`M ${x} ${y - vertical} L ${x + horizontal} ${y} L ${x} ${y + vertical} L ${x - horizontal} ${y} Z`}
        opacity={star.o}
        className={className}
        style={style}
        transform={`rotate(${star.rotation} ${x} ${y})`}
      />
    );
  }

  if (star.kind === "cross") {
    return (
      <g opacity={star.o} className={className} style={style}>
        <line x1={x - star.r * 3.4} y1={y} x2={x + star.r * 3.4} y2={y} />
        <line x1={x} y1={y - star.r * 5.2} x2={x} y2={y + star.r * 5.2} />
        <circle cx={x} cy={y} r={star.r * 1.15} />
      </g>
    );
  }

  if (star.kind === "binary") {
    const gap = star.r * 1.9;
    return (
      <g
        opacity={star.o}
        className={className}
        style={style}
        transform={`rotate(${star.rotation} ${x} ${y})`}
      >
        <circle cx={x - gap} cy={y} r={star.r} />
        <circle cx={x + gap} cy={y} r={star.r * 0.58} opacity="0.72" />
      </g>
    );
  }

  return (
    <circle
      cx={x}
      cy={y}
      r={star.kind === "soft" ? star.r * 1.3 : star.r}
      opacity={star.o}
      className={className}
      style={style}
    />
  );
}

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
        {STARFIELD.map((star, i) => <SkyStar key={i} star={star} index={i} />)}
      </svg>
    </div>
  );
}
