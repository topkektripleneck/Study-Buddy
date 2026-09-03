/**
 * Schedule block colors — slots on the global theme palette in tokens.css.
 * Not per-widget; when themes ship, swap these vars once at :root.
 */const BLOCK_KIND_COLOR: Record<string, string> = {
  focus: "var(--sb-const-orion)",
  break: "var(--sb-const-cygnus)",
  grounding: "var(--sb-const-draco)",
  admin: "var(--sb-const-pegasus)",
  milestone: "var(--sb-const-leo)",
  buffer: "var(--sb-const-gemini)",
  // legacy color tokens
  accent: "var(--sb-const-orion)",
  warm: "var(--sb-const-leo)",
  success: "var(--sb-const-draco)",
  // blocks saved with old constellation ids
  orion: "var(--sb-const-orion)",
  leo: "var(--sb-const-leo)",
  scorpio: "var(--sb-const-scorpio)",
  lyra: "var(--sb-const-lyra)",
  cassiopeia: "var(--sb-const-cassiopeia)",
  ursa: "var(--sb-const-ursa)",
  cygnus: "var(--sb-const-cygnus)",
  andromeda: "var(--sb-const-andromeda)",
  draco: "var(--sb-const-draco)",
  pegasus: "var(--sb-const-pegasus)",
  gemini: "var(--sb-const-gemini)",
  aries: "var(--sb-const-aries)",
};

export function resolveBlockColor(token: string): string {
  return BLOCK_KIND_COLOR[token] ?? "var(--sb-accent-dim)";
}
