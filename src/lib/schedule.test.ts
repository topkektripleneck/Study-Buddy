import { describe, expect, it } from "vitest";
import type { CalendarTimeBlock } from "@/types";
import {
  findConflicts,
  overlapLayouts,
  parseTimeRange,
  parseTimeToken,
  resizeBlockEnd,
} from "./schedule";

function block(id: string, start: string, end: string): CalendarTimeBlock {
  return {
    id,
    title: id,
    taskId: null,
    quadrantItemId: null,
    startAt: start,
    endAt: end,
    allDay: false,
    kind: "focus",
    colorToken: "focus",
    notes: null,
    recurrence: null,
    seriesId: null,
    createdAt: start,
    updatedAt: start,
  };
}

describe("parseTimeToken", () => {
  it("parses 24h and am/pm tokens", () => {
    expect(parseTimeToken("13:30")).toEqual({ hour: 13, minute: 30 });
    expect(parseTimeToken("1:30pm")).toEqual({ hour: 13, minute: 30 });
    expect(parseTimeToken("9")).toEqual({ hour: 9, minute: 0 });
  });
});

describe("parseTimeRange", () => {
  it("carries pm suffix to the start time", () => {
    expect(parseTimeRange("1-2pm")).toEqual({
      start: { hour: 13, minute: 0 },
      end: { hour: 14, minute: 0 },
    });
  });
});

describe("findConflicts", () => {
  it("treats touching edges as non-overlapping", () => {
    const existing = [block("a", "2026-01-01T09:00:00.000Z", "2026-01-01T10:00:00.000Z")];
    expect(findConflicts(existing, "2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z")).toEqual(
      [],
    );
  });
});

describe("overlapLayouts", () => {
  it("assigns side-by-side columns for overlapping blocks", () => {
    const blocks = [
      block("a", "2026-01-01T09:00:00.000Z", "2026-01-01T10:30:00.000Z"),
      block("b", "2026-01-01T09:30:00.000Z", "2026-01-01T11:00:00.000Z"),
    ];
    const layouts = overlapLayouts(blocks, 8);
    expect(layouts.get("a")?.column).toBe(0);
    expect(layouts.get("b")?.column).toBe(1);
    expect(layouts.get("a")?.columns).toBe(2);
    expect(layouts.get("b")?.columns).toBe(2);
  });
});

describe("resizeBlockEnd", () => {
  it("extends end time by delta minutes", () => {
    const original = block("a", "2026-01-01T09:00:00.000Z", "2026-01-01T10:00:00.000Z");
    const resized = resizeBlockEnd(original, 30);
    expect(new Date(resized.endAt).getTime() - new Date(original.endAt).getTime()).toBe(
      30 * 60_000,
    );
  });
});
