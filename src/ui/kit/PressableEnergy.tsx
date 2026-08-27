import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface PressableEnergyProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "ghost";
}

export function PressableEnergy({
  children,
  variant = "primary",
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
    transition: `transform var(--sb-duration-fast) var(--sb-ease-spring), box-shadow var(--sb-duration-fast) var(--sb-ease-kinetic), background var(--sb-duration-fast)`,
    ...style,
  } as const;

  const variants = {
    primary: {
      background: "linear-gradient(135deg, var(--sb-accent-dim), #1a3a44)",
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
      style={{ ...base, ...variants[variant] }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
        props.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        props.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        props.onMouseLeave?.(e);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
