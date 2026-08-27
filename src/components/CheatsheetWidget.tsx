import { COMMANDS } from "@/lib/commands";
import { Surface } from "@/ui/kit";

export function CheatsheetWidget() {
  return (
    <Surface padding="md">
      <h3 style={title}>Commands</h3>
      <p style={hint}>Ctrl+K opens the bar · Tab completes · ↑↓ history</p>
      <ul style={list}>
        {COMMANDS.map((command) => (
          <li key={command.id} style={row}>
            <code style={usage}>{command.usage}</code>
            <span style={summary}>{command.summary}</span>
            {command.names.length > 1 && (
              <span style={aliases}>{command.names.slice(1).join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}

const title = { margin: "0 0 4px", fontSize: "16px" };
const hint = { margin: "0 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };
const list = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  maxHeight: "220px",
  overflowY: "auto" as const,
};
const row = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  columnGap: "8px",
  alignItems: "baseline",
};
const usage = {
  fontFamily: "var(--sb-font-mono)",
  fontSize: "12px",
  color: "var(--sb-accent)",
};
const summary = { fontSize: "12px", color: "var(--sb-text-secondary)" };
const aliases = {
  gridColumn: "1 / -1",
  fontSize: "11px",
  color: "var(--sb-text-muted)",
};
