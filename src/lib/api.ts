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

export const api = {
  openDataDir: () => invoke<void>("storage_open_data_dir"),
  storageExportZip: (destPath: string) =>
    invoke<string>("storage_export_zip", { destPath }),
  storageImportZip: (srcPath: string) =>
    invoke<string>("storage_import_zip", { srcPath }),

  tasksList: () => invoke<TaskItem[]>("tasks_list"),
  taskCreate: (title: string) => invoke<TaskItem>("task_create", { title }),
  taskUpdate: (task: TaskItem) => invoke<TaskItem>("task_update", { task }),
  taskToggleDone: (taskId: string) =>
    invoke<TaskItem>("task_toggle_done", { taskId }),
  taskDelete: (taskId: string) => invoke<void>("task_delete", { taskId }),
  taskReorder: (orderedIds: string[]) =>
    invoke<TaskItem[]>("task_reorder", { orderedIds }),

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

  calendarList: () => invoke<CalendarTimeBlock[]>("calendar_list"),
  calendarSaveBlock: (block: CalendarTimeBlock) =>
    invoke<CalendarTimeBlock>("calendar_save_block", { block }),
  calendarDeleteBlock: (blockId: string) =>
    invoke<void>("calendar_delete_block", { blockId }),
  calendarImportIcs: (srcPath: string) =>
    invoke<CalendarImportResult>("calendar_import_ics", { srcPath }),

  metricsGet: () => invoke<ConsistencyMetric>("metrics_get"),
  metricsSetTarget: (dailyTargetMinutes: number) =>
    invoke<ConsistencyMetric>("metrics_set_target", { dailyTargetMinutes }),
  activityDailyTotals: (days: number) =>
    invoke<DailyFocus[]>("activity_daily_totals", { days }),

  configGet: () => invoke<AppConfig>("config_get"),
  configSave: (config: AppConfig) => invoke<AppConfig>("config_save", { config }),
  notifyTest: () => invoke<void>("notify_test"),

  layoutGet: () => invoke<WidgetLayout>("layout_get"),
  layoutSave: (layout: WidgetLayout) => invoke<void>("layout_save", { layout }),

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
