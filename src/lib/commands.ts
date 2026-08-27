import {
  addBlock,
  createTask,
  deleteTask,
  findTaskByQuery,
  navigateTo,
  pauseTimer,
  removeBlockAt,
  resetTimer,
  resumeTimer,
  setHud,
  skipPhase,
  startFocus,
  startStopwatch,
  toggleHud,
  toggleTaskDone,
  type ActionResult,
} from "@/lib/actions";
import { api } from "@/lib/api";
import { BLOCK_KINDS, parseTimeRange, parseTimeToken } from "@/lib/schedule";
import type { BlockKind, MainTab, PendingConflict } from "@/types";

export type { PendingConflict } from "@/types";

export interface CommandOutcome extends ActionResult {
  pending?: PendingConflict;
}

export interface CommandSpec {
  id: string;
  names: string[];
  usage: string;
  summary: string;
  run: (args: string[]) => Promise<CommandOutcome>;
}

function tokenize(input: string): string[] {
  const matches = input.trim().match(/"[^"]*"|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^"|"$/g, ""));
}

const TAB_ALIASES: Record<string, MainTab> = {
  widgets: "widgets",
  w: "widgets",
  home: "widgets",
  schedule: "schedule",
  s: "schedule",
  calendar: "schedule",
  matrix: "matrix",
  m: "matrix",
  eisenhower: "matrix",
};

export const COMMANDS: CommandSpec[] = [
  {
    id: "timer",
    names: ["timer", "t", "focus"],
    usage: "timer <minutes|stopwatch>",
    summary: "Start focus or stopwatch",
    run: async (args) => {
      if (args[0] === "stopwatch" || args[0] === "sw") return startStopwatch();
      if (!args[0]) return startFocus();
      const minutes = Number(args[0]);
      if (!Number.isFinite(minutes)) {
        return { ok: false, message: `"${args[0]}" is not a number of minutes` };
      }
      return startFocus(minutes);
    },
  },
  { id: "pause", names: ["pause", "p"], usage: "pause", summary: "Pause timer", run: () => pauseTimer() },
  { id: "resume", names: ["resume", "r"], usage: "resume", summary: "Resume timer", run: () => resumeTimer() },
  { id: "reset", names: ["reset"], usage: "reset", summary: "Clear session", run: () => resetTimer() },
  { id: "skip", names: ["skip"], usage: "skip", summary: "Next phase", run: () => skipPhase() },
  {
    id: "block",
    names: ["block", "b"],
    usage: 'block <1:30-2:30> [kind] "title"',
    summary: "Add a time block",
    run: async (args) => {
      const range = args[0] ? parseTimeRange(args[0]) : null;
      if (!range) return { ok: false, message: "Expected a range like 1:30-2:30" };
      const { kind, title } = readKindAndTitle(args.slice(1));
      const outcome = await addBlock({ title, kind, start: range.start, end: range.end });
      if (!outcome.ok && outcome.conflicts.length > 0 && outcome.block) {
        return { ok: false, message: outcome.message, pending: { block: outcome.block, conflicts: outcome.conflicts } };
      }
      return { ok: outcome.ok, message: outcome.message };
    },
  },
  {
    id: "remove",
    names: ["rm", "remove", "del"],
    usage: "rm <time|task>",
    summary: "Remove block or task",
    run: async (args) => {
      const raw = args.join(" ");
      if (!raw) return { ok: false, message: "Give a time or task name" };
      const time = parseTimeToken(args[0]);
      if (time && args.length === 1) return removeBlockAt(time);
      const task = findTaskByQuery(await api.tasksList(), raw);
      if (!task) return { ok: false, message: `No task matching "${raw}"` };
      return deleteTask(task.id);
    },
  },
  {
    id: "task",
    names: ["task", "add", "n"],
    usage: "task <title>",
    summary: "Add a task",
    run: (args) => createTask(args.join(" ")),
  },
  {
    id: "done",
    names: ["done", "d"],
    usage: "done <task>",
    summary: "Complete a task",
    run: async (args) => {
      const raw = args.join(" ");
      if (!raw) return { ok: false, message: "Name a task" };
      const task = findTaskByQuery(await api.tasksList(), raw);
      if (!task) return { ok: false, message: `No task matching "${raw}"` };
      return toggleTaskDone(task.id);
    },
  },
  {
    id: "go",
    names: ["go", "g"],
    usage: "go <widgets|schedule|matrix>",
    summary: "Jump to a view",
    run: async (args) => {
      const tab = TAB_ALIASES[args[0]?.toLowerCase() ?? ""];
      if (!tab) return { ok: false, message: "Pick widgets, schedule, or matrix" };
      return navigateTo(tab);
    },
  },
  {
    id: "hud",
    names: ["hud"],
    usage: "hud [on|off]",
    summary: "Show, hide, or toggle HUD",
    run: async (args) => {
      if (args[0] === "on") return setHud(true);
      if (args[0] === "off") return setHud(false);
      return toggleHud();
    },
  },
  {
    id: "data",
    names: ["data"],
    usage: "data",
    summary: "Open local data folder",
    run: async () => {
      await api.openDataDir();
      return { ok: true, message: "Opened data folder" };
    },
  },
];

function readKindAndTitle(args: string[]): { kind: BlockKind; title: string } {
  const maybeKind = args[0]?.toLowerCase();
  const known = BLOCK_KINDS.find((k) => k.value === maybeKind);
  const rest = known ? args.slice(1) : args;
  return {
    kind: known?.value ?? "focus",
    title: rest.join(" ").trim() || "Untitled block",
  };
}

export function resolveCommand(input: string): { spec: CommandSpec; args: string[] } | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  const head = tokens[0].toLowerCase();
  const spec = COMMANDS.find((command) => command.names.includes(head));
  return spec ? { spec, args: tokens.slice(1) } : null;
}

export function suggestCommands(input: string): CommandSpec[] {
  const head = tokenize(input)[0]?.toLowerCase() ?? "";
  if (!head) return COMMANDS;
  return COMMANDS.filter((command) => command.names.some((name) => name.startsWith(head)));
}

export async function runCommand(input: string): Promise<CommandOutcome> {
  const resolved = resolveCommand(input);
  if (!resolved) {
    const head = tokenize(input)[0] ?? "";
    return { ok: false, message: head ? `Unknown command "${head}"` : "Type a command" };
  }
  try {
    return await resolved.spec.run(resolved.args);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
