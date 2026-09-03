import { save, open } from "@tauri-apps/plugin-dialog";
import {
  addBlock,
  createTask,
  deleteTask,
  exportBackup,
  importBackup,
  importCalendarIcs,
  findTaskByQuery,
  navigateTo,
  openSettings,
  pauseTimer,
  removeBlockAt,
  resetData,
  resumeTimer,
  setHud,
  setDailyTarget,
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

function stripDocSyntax(token: string): string {
  let s = token.trim();
  if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1);
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  return s;
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
  { id: "reset", names: ["reset"], usage: "reset [all|timer|tasks|calendar|matrix|widgets|journal|energy|metrics]", summary: "Clear timer or reset saved data", run: async (args) => {
      const target = args[0] ? stripDocSyntax(args[0].toLowerCase()) : "timer";
      return resetData(target);
    },
  },
  { id: "skip", names: ["skip"], usage: "skip", summary: "Next phase", run: () => skipPhase() },
  {
    id: "target",
    names: ["target", "goal"],
    usage: "target <minutes>",
    summary: "Set daily focus goal",
    run: async (args) => {
      if (!args[0]) return { ok: false, message: "Give a number of minutes (e.g. target 120)" };
      const minutes = Number(args[0]);
      if (!Number.isFinite(minutes)) {
        return { ok: false, message: `"${args[0]}" is not a number of minutes` };
      }
      return setDailyTarget(minutes);
    },
  },
  {
    id: "block",
    names: ["block", "b"],
    usage: 'block 1:30-2:30 focus "title"',
    summary: "Add a time block",
    run: async (args) => {
      const range = args[0] ? parseTimeRange(stripDocSyntax(args[0])) : null;
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
    id: "settings",
    names: ["settings", "prefs", "preferences"],
    usage: "settings [appearance|notifications|focus|schedule|windows|data]",
    summary: "Open settings",
    run: async (args) => {
      const section = args[0]?.toLowerCase();
      const sections: Record<string, import("@/types").SettingsSection> = {
        appearance: "appearance",
        theme: "appearance",
        notifications: "notifications",
        notify: "notifications",
        focus: "focus",
        timer: "focus",
        schedule: "schedule",
        calendar: "schedule",
        windows: "windows",
        hud: "windows",
        data: "data",
      };
      return openSettings(section ? sections[section] : undefined);
    },
  },
  {
    id: "export",
    names: ["export", "backup"],
    usage: "export",
    summary: "Save a zip backup of local data",
    run: async () => {
      const dest = await save({
        defaultPath: `study-buddy-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      });
      if (!dest || typeof dest !== "string") {
        return { ok: false, message: "Export cancelled" };
      }
      return exportBackup(dest);
    },
  },
  {
    id: "import",
    names: ["import", "restore"],
    usage: "import",
    summary: "Restore local data from a backup zip",
    run: async () => {
      const src = await open({
        multiple: false,
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      });
      if (!src || typeof src !== "string") {
        return { ok: false, message: "Restore cancelled" };
      }
      if (
        !window.confirm(
          "Restore from this backup? Current data will be replaced. A pre-restore snapshot is saved under backups/.",
        )
      ) {
        return { ok: false, message: "Restore cancelled" };
      }
      return importBackup(src);
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
  {
    id: "gcal",
    names: ["gcal", "ics"],
    usage: "gcal",
    summary: "Import a Google Calendar .ics export",
    run: async () => {
      const src = await open({
        multiple: false,
        filters: [{ name: "iCalendar", extensions: ["ics"] }],
      });
      if (!src || typeof src !== "string") {
        return { ok: false, message: "Import cancelled" };
      }
      return importCalendarIcs(src);
    },
  },
];

function readKindAndTitle(args: string[]): { kind: BlockKind; title: string } {
  const maybeKind = stripDocSyntax(args[0]?.toLowerCase() ?? "");
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
