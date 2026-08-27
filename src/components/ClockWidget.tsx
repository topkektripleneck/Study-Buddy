import { useEffect, useState } from "react";
import { Surface } from "@/ui/kit";

export function ClockWidget() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Surface padding="lg">
      <p style={label}>Current Time</p>
      <p style={clock}>
        {time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
      <p style={date}>{time.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</p>
    </Surface>
  );
}

const label = {
  margin: "0 0 8px",
  fontSize: "12px",
  color: "var(--sb-text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const clock = {
  margin: 0,
  fontFamily: "var(--sb-font-mono)",
  fontSize: "36px",
  fontWeight: 700,
};

const date = {
  margin: "8px 0 0",
  color: "var(--sb-text-secondary)",
};
