import { describe, expect, it } from "vitest";
import { COMMANDS, resolveCommand, suggestCommands } from "./commands";

describe("resolveCommand", () => {
  it("matches command aliases and passes args", () => {
    const resolved = resolveCommand("t 25");
    expect(resolved?.spec.id).toBe("timer");
    expect(resolved?.args).toEqual(["25"]);
  });

  it("returns null for unknown input", () => {
    expect(resolveCommand("nope")).toBeNull();
  });
});

describe("suggestCommands", () => {
  it("filters by prefix", () => {
    const ids = suggestCommands("pa").map((c) => c.id);
    expect(ids).toContain("pause");
  });

  it("lists everything for empty query", () => {
    expect(suggestCommands("").length).toBe(COMMANDS.length);
  });
});
