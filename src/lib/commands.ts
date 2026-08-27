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
import { BLOCK_KINDS, formatClockLabel, parseTimeRange, parseTimeToken } from "@/lib/schedule";
import type { BlockKind, CalendarTimeBlock, MainTab } from "@/types";

export interface PendingConflict {
  block: CalendarTimeBlock;
  conflicts: CalendarTimeBlock[];
}

export interface CommandOutcome extends ActionResult {
  pending?: PendingConflict;
}

export interface CommandSpec {
  id: string;
  /** First token aliases that select this command. */
  names: string[];
  usage: string;
  summary: string;
  preview: (args: string[]) => string;
  run: (args: string[]) => Promise<CommandOutcome>;
}

/** Splits on whitespace but keeps "quoted phrases" intact. */
export function tokenize(input: string): string[] {
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
    summary: "Start a focus session or the stopwatch",
    preview: (args) => {
      if (args[0] === "stopwatch" || args[0] === "sw") return "Starts the stopwatch";
      const minutes = Number(args[0]);
      if (!args[0]) return "Starts a focus session at your configured length";
      if (!Number.isFinite(minutes)) return "Expected a number of minutes";
      return `Starts a ${minutes}m focus session`;
    },
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
  {
    id: "pause",
    names: ["pause", "p"],
    usage: "pause",
    summary: "Pause the running timer",
    preview: () => "Pauses the timer",
    run: () => pauseTimer(),
  },
  {
    id: "resume",
    names: ["resume", "r"],
    usage: "resume",
    summary: "Resume a paused timer",
    preview: () => "Resumes the timer",
    run: () => resumeTimer(),
  },
  {
    id: "reset",
    names: ["reset"],
    usage: "reset",
    summary: "Stop and clear the session",
    preview: () => "Clears the current session",
    run: () => resetTimer(),
  },
  {
    id: "skip",
    names: ["skip"],
    usage: "skip",
    summary: "Jump to the next phase",
    preview: () => "Advances to the next phase",
    run: () => skipPhase(),
  },
  {
    id: "block",
    names: ["block", "b"],
    usage: 'block <start-end> [kind] <title>',
    summary: "Add a time block, e.g. block 1:30-2:30 focus Essay",
    preview: (args) => {
      const range = args[0] ? parseTimeRange(args[0]) : null;
      if (!range) return "Expected a range like 1:30-2:30";
      const { kind, title } = readKindAndTitle(args.slice(1));
      const label = `${formatClockLabel(range.start.hour, range.start.minute)}–${formatClockLabel(
        range.end.hour,
        range.end.minute,
      )}`;
      return `Adds ${kind} block "${title}" at ${label}`;
    },
    run: async (args) => {
      const range = args[0] ? parseTimeRange(args[0]) : null;
      if (!range) {
        return { ok: false, message: "Expected a range like 1:30-2:30" };
      }
      const { kind, title } = readKindAndTitle(args.slice(1));
      const outcome = await addBlock({ title, kind, start: range.start, end: range.end });

      if (!outcome.ok && outcome.conflicts.length > 0 && outcome.block) {
        return {
          ok: false,
          message: outcome.message,
          pending: { block: outcome.block, conflicts: outcome.conflicts },
        };
      }
      return { ok: outcome.ok, message: outcome.message };
    },
  },
  {
    id: "remove",
    names: ["rm", "remove", "del"],
    usage: "rm <time|task name>",
    summary: "Remove a block by time, or a task by name",
    preview: (args) => {
      const raw = args.join(" ");
      if (!raw) return "Give a time (1:30) or a task name";
      const time = parseTimeToken(args[0]);
      if (time && args.length === 1) {
        return `Removes the block at ${formatClockLabel(time.hour, time.minute)}`;
      }
      return `Removes the task matching "${raw}"`;
    },
    run: async (args) => {
      const raw = args.join(" ");
      if (!raw) return { ok: false, message: "Give a time or a task name" };

      const time = parseTimeToken(args[0]);
      if (time && args.length === 1) return removeBlockAt(time);

      const tasks = await api.tasksList();
      const task = findTaskByQuery(tasks, raw);
      if (!task) return { ok: false, message: `No task matching "${raw}"` };
      return deleteTask(task.id);
    },
  },
  {
    id: "task",
    names: ["task", "add", "n"],
    usage: "task <title>",
    summary: "Add a task",
    preview: (args) =>
      args.length ? `Adds task "${args.join(" ")}"` : "Give the task a title",
    run: (args) => createTask(args.join(" ")),
  },
  {
    id: "done",
    names: ["done", "d"],
    usage: "done <task name>",
    summary: "Mark a task complete",
    preview: (args) =>
      args.length ? `Completes the task matching "${args.join(" ")}"` : "Name a task",
    run: async (args) => {
      const raw = args.join(" ");
      if (!raw) return { ok: false, message: "Name a task" };
      const tasks = await api.tasksList();
      const task = findTaskByQuery(tasks, raw);
      if (!task) return { ok: false, message: `No task matching "${raw}"` };
      return toggleTaskDone(task.id);
    },
  },
  {
    id: "go",
    names: ["go", "g"],
    usage: "go <widgets|schedule|matrix>",
    summary: "Jump to a view",
    preview: (args) => {
      const tab = TAB_ALIASES[args[0]?.toLowerCase() ?? ""];
      return tab ? `Opens ${tab}` : "Pick widgets, schedule, or matrix";
    },
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
    summary: "Show, hide, or toggle the HUD",
    preview: (args) => {
      if (args[0] === "on") return "Shows the HUD";
      if (args[0] === "off") return "Hides the HUD";
      return "Toggles the HUD";
    },
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
    summary: "Open the local data folder",
    preview: () => "Opens the folder holding your JSON files",
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
    kind: (known?.value ?? "focus") as BlockKind,
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

/** Commands whose name starts with the typed head, for the suggestion list. */
export function suggestCommands(input: string): CommandSpec[] {
  const head = tokenize(input)[0]?.toLowerCase() ?? "";
  if (!head) return COMMANDS;
  return COMMANDS.filter((command) =>
    command.names.some((name) => name.startsWith(head)),
  );
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
