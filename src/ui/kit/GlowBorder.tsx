import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface GlowBorderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  active?: boolean;
  tone?: "accent" | "warm" | "success";
}

const toneMap = {
  accent: "var(--sb-glow-accent)",
  warm: "var(--sb-glow-warm)",
  success: "var(--sb-glow-success)",
} as const;

export function GlowBorder({
  children,
  active = false,
  tone = "accent",
  style,
  ...props
}: GlowBorderProps) {
  const glowStyle: CSSProperties = {
    position: "relative",
    borderRadius: "var(--sb-radius-md)",
    padding: "1px",
    background: active
      ? `linear-gradient(135deg, ${toneMap[tone]}, transparent 60%)`
      : "var(--sb-border-subtle)",
    boxShadow: active ? `0 0 24px ${toneMap[tone]}` : "none",
    transition: `box-shadow var(--sb-duration-normal) var(--sb-ease-kinetic)`,
    ...style,
  };

  const innerStyle: CSSProperties = {
    borderRadius: "calc(var(--sb-radius-md) - 1px)",
    background: "var(--sb-bg-raised)",
    height: "100%",
  };

  return (
    <div style={glowStyle} {...props}>
      <div style={innerStyle}>{children}</div>
    </div>
  );
}
