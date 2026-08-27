import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "base" | "raised" | "overlay";
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "0",
  sm: "var(--sb-space-sm)",
  md: "var(--sb-space-md)",
  lg: "var(--sb-space-lg)",
} as const;

const variantBg: Record<NonNullable<SurfaceProps["variant"]>, string> = {
  base: "var(--sb-bg-base)",
  raised: "var(--sb-bg-raised)",
  overlay: "var(--sb-bg-overlay)",
};

export function Surface({
  children,
  variant = "raised",
  padding = "md",
  style,
  ...props
}: SurfaceProps) {
  const surfaceStyle: CSSProperties = {
    background: variantBg[variant],
    borderRadius: "var(--sb-radius-md)",
    border: "1px solid var(--sb-border-subtle)",
    padding: paddingMap[padding],
    ...style,
  };

  return (
    <div style={surfaceStyle} {...props}>
      {children}
    </div>
  );
}
