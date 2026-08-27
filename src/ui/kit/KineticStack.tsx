import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface KineticStackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  direction?: "row" | "column";
  gap?: "sm" | "md" | "lg";
  align?: CSSProperties["alignItems"];
}

const gapMap = {
  sm: "var(--sb-space-sm)",
  md: "var(--sb-space-md)",
  lg: "var(--sb-space-lg)",
} as const;

export function KineticStack({
  children,
  direction = "column",
  gap = "md",
  align = "stretch",
  style,
  ...props
}: KineticStackProps) {
  const stackStyle: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: gapMap[gap],
    alignItems: align,
    ...style,
  };

  return (
    <div style={stackStyle} {...props}>
      {children}
    </div>
  );
}
