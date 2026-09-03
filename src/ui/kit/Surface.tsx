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

export function Surface({
  children,
  variant = "raised",
  padding = "md",
  style,
  className,
  ...props
}: SurfaceProps) {
  const surfaceStyle: CSSProperties = {
    borderRadius: "var(--sb-radius-md)",
    border: "1px solid var(--sb-border-subtle)",
    padding: paddingMap[padding],
    ...style,
  };

  return (
    <div
      className={["sb-surface", `sb-surface--${variant}`, className].filter(Boolean).join(" ")}
      style={surfaceStyle}
      {...props}
    >
      {children}
    </div>
  );
}
