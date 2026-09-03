import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface PressableEnergyProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "ghost";
}

export function PressableEnergy({
  children,
  variant = "primary",
  className,
  style,
  ...props
}: PressableEnergyProps) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--sb-space-sm)",
    padding: "var(--sb-space-sm) var(--sb-space-md)",
    borderRadius: "var(--sb-radius-sm)",
    border: "1px solid transparent",
    fontWeight: 600,
    ...style,
  } as const;

  const variants = {
    primary: {
      background: "linear-gradient(135deg, var(--sb-accent-dim), var(--sb-bg-overlay))",
      color: "var(--sb-text-primary)",
      borderColor: "var(--sb-border-glow)",
      boxShadow: "0 0 16px var(--sb-glow-accent)",
    },
    ghost: {
      background: "transparent",
      color: "var(--sb-text-secondary)",
      borderColor: "var(--sb-border-subtle)",
    },
  } as const;

  return (
    <button
      type="button"
      className={["sb-pressable", "sb-pressable-hover", className].filter(Boolean).join(" ")}
      style={{ ...base, ...variants[variant] }}
      {...props}
    >
      {children}
    </button>
  );
}
