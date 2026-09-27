import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  CalendarImportResult,
  CalendarTimeBlock,
  ConsistencyMetric,
  DailyFocus,
  EisenhowerMatrixFile,
  EisenhowerQuadrant,
  EnergyLogEntry,
  JournalEntry,
  TaskItem,
  TimerRestoreOffer,
  TimerTickPayload,
  WidgetLayout,
} from "@/types";

function hasTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

function safeInvoke<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (!hasTauri()) {
    return Promise.resolve(fallback as T);
  }
  return invoke<T>(cmd, args);
}

export const api = {
  openDataDir: () => safeInvoke<void>("storage_open_data_dir"),
  storageExportZip: (destPath: string) =>
    safeInvoke<string>("storage_export_zip", { destPath }, ""),
  storageImportZip: (srcPath: string) =>
    safeInvoke<string>("storage_import_zip", { srcPath }, ""),

  tasksList: () => safeInvoke<TaskItem[]>("tasks_list", undefined, []),
  taskCreate: (title: string) =>
    safeInvoke<TaskItem>("task_create", { title }, {
      id: crypto.randomUUID(),
      title,
      status: "open",
      priority: "normal",
      order: 0,
      parentId: null,
      notes: null,
      quadrant: null,
      tags: [],
      estimateMinutes: null,
      actualMinutes: 0,
      dueAt: null,
      deferUntil: null,
      linkedBlockIds: [],
      checklist: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    }),
  taskUpdate: (task: TaskItem) => safeInvoke<TaskItem>("task_update", { task }, task),
  taskToggleDone: (taskId: string) =>
    safeInvoke<TaskItem>("task_toggle_done", { taskId }, {
      id: taskId,
      title: "",
      status: "done",
      priority: "normal",
      order: 0,
      parentId: null,
      notes: null,
      quadrant: null,
      tags: [],
      estimateMinutes: null,
      actualMinutes: 0,
      dueAt: null,
      deferUntil: null,
      linkedBlockIds: [],
      checklist: [],
      createdAt: "",
      updatedAt: "",
      completedAt: new Date().toISOString(),
    }),
  taskDelete: (taskId: string) => safeInvoke<void>("task_delete", { taskId }),
  taskReorder: (orderedIds: string[]) =>
    safeInvoke<TaskItem[]>("task_reorder", { orderedIds }, []),

  matrixGet: () => invoke<EisenhowerMatrixFile>("matrix_get"),
  matrixSetQuadrant: (taskId: string, quadrant: EisenhowerQuadrant) =>
    invoke<EisenhowerMatrixFile>("matrix_set_quadrant", { taskId, quadrant }),
  matrixMoveItem: (itemId: string, toQuadrant: EisenhowerQuadrant, toIndex: number) =>
    invoke<EisenhowerMatrixFile>("matrix_move_item", { itemId, toQuadrant, toIndex }),
  matrixStageForCalendar: (itemId: string) =>
    invoke<void>("matrix_stage_for_calendar", { itemId }),
  matrixRemoveItem: (itemId: string) =>
    invoke<EisenhowerMatrixFile>("matrix_remove_item", { itemId }),
  matrixUpdateItem: (
    itemId: string,
    fields: { delegateTo?: string; eliminationReason?: string },
  ) =>
    invoke<EisenhowerMatrixFile>("matrix_update_item", {
      itemId,
      ...fields,
    }),

  calendarList: () => safeInvoke<CalendarTimeBlock[]>("calendar_list", undefined, []),
  calendarSaveBlock: (block: CalendarTimeBlock) =>
    safeInvoke<CalendarTimeBlock>("calendar_save_block", { block }, block),
  calendarDeleteBlock: (blockId: string) =>
    safeInvoke<void>("calendar_delete_block", { blockId }),
  calendarImportIcs: (srcPath: string) =>
    safeInvoke<CalendarImportResult>("calendar_import_ics", { srcPath }, {
      imported: 0,
      skipped: 0,
      updated: 0,
      removed: 0,
      message: "",
    }),
  calendarSyncGcal: (force: boolean) =>
    safeInvoke<CalendarImportResult>("calendar_sync_gcal", { force }, {
      imported: 0,
      skipped: 0,
      updated: 0,
      removed: 0,
      message: "",
    }),
  calendarExportIcs: (destPath: string) =>
    safeInvoke<string>("calendar_export_ics", { destPath }, ""),

  metricsGet: () => safeInvoke<ConsistencyMetric>("metrics_get", undefined, {
    schemaVersion: 1,
    currentStreakDays: 1,
    longestStreakDays: 1,
    streakAnchorDate: null,
    todayFocusMs: 0,
    todayCompletionPercent: 0,
    dailyTargetMinutes: 120,
    lastRecalculatedAt: new Date().toISOString(),
  }),
  metricsSetTarget: (dailyTargetMinutes: number) =>
    safeInvoke<ConsistencyMetric>("metrics_set_target", { dailyTargetMinutes }, {
      schemaVersion: 1,
      currentStreakDays: 1,
      longestStreakDays: 1,
      streakAnchorDate: null,
      todayFocusMs: 0,
      todayCompletionPercent: 0,
      dailyTargetMinutes,
      lastRecalculatedAt: new Date().toISOString(),
    }),
  metricsSetStreak: (streakDays: number | null) =>
    safeInvoke<ConsistencyMetric>("metrics_set_streak", { streakDays }, {
      schemaVersion: 1,
      currentStreakDays: streakDays ?? 0,
      longestStreakDays: streakDays ?? 0,
      streakAnchorDate: null,
      todayFocusMs: 0,
      todayCompletionPercent: 0,
      dailyTargetMinutes: 120,
      lastRecalculatedAt: new Date().toISOString(),
      streakOverride: streakDays,
    }),
  activityDailyTotals: (days: number) =>
    safeInvoke<DailyFocus[]>("activity_daily_totals", { days }, []),

  configGet: () => safeInvoke<AppConfig>("config_get", undefined, {
    schemaVersion: 1,
    pomodoroFocusMinutes: 25,
    pomodoroShortBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroCycleLength: 4,
    hudAutoShowOnSessionStart: true,
    coloredTimeBlocks: true,
    activeWidgets: ["focus", "clock"],
  }),
  configSave: (config: AppConfig) => safeInvoke<AppConfig>("config_save", { config }, config),
  notifyTest: () => safeInvoke<void>("notify_test"),

  layoutGet: () => safeInvoke<WidgetLayout>("layout_get", undefined, { schemaVersion: 1, widgetIds: ["focus", "clock"] }),
  layoutSave: (layout: WidgetLayout) => safeInvoke<void>("layout_save", { layout }),

  dataReset: (target: string) => invoke<string>("data_reset", { target }),

  energyRecent: (days: number) => invoke<EnergyLogEntry[]>("energy_recent", { days }),
  energyLog: (level: number) => invoke<EnergyLogEntry>("energy_log", { level }),

  journalList: () => invoke<JournalEntry[]>("journal_list"),
  journalSave: (text: string) => invoke<JournalEntry>("journal_save", { text }),
  journalDelete: (entryId: string) => invoke<void>("journal_delete", { entryId }),

  chimeImport: (sourcePath: string, slot: "start" | "end") =>
    invoke<AppConfig>("chime_import", { sourcePath, slot }),

  timerGet: () => invoke<TimerTickPayload | null>("timer_get"),
  timerStart: (protocol?: string, durationMinutes?: number) =>
    invoke<TimerTickPayload>("timer_start", { protocol, durationMinutes }),
  timerPause: () => invoke<TimerTickPayload>("timer_pause"),
  timerResume: () => invoke<TimerTickPayload>("timer_resume"),
  timerReset: () => invoke<void>("timer_reset"),
  timerSkipPhase: () => invoke<TimerTickPayload>("timer_skip_phase"),
  timerGetPendingRestore: () =>
    invoke<TimerRestoreOffer | null>("timer_get_pending_restore"),
  timerConfirmRestore: () => invoke<TimerTickPayload>("timer_confirm_restore"),
  timerDiscardRestore: () => invoke<void>("timer_discard_restore"),
  timerAckSuspend: () => invoke<TimerTickPayload>("timer_ack_suspend"),
  timerSubscribe: (channel: Channel<TimerTickPayload>) =>
    invoke<void>("timer_subscribe", { channel }),

  autostartEnable: () => invoke<void>("autostart_enable"),
  autostartDisable: () => invoke<void>("autostart_disable"),
  autostartIsEnabled: () => invoke<boolean>("autostart_is_enabled"),
};
