import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  CalendarTimeBlock,
  ConsistencyMetric,
  DailyFocus,
  EisenhowerMatrixFile,
  EisenhowerQuadrant,
  EnergyLogEntry,
  JournalEntry,
  TaskItem,
  TimerTickPayload,
  WidgetLayout,
} from "@/types";

export const api = {
  openDataDir: () => invoke<void>("storage_open_data_dir"),

  tasksList: () => invoke<TaskItem[]>("tasks_list"),
  taskCreate: (title: string) => invoke<TaskItem>("task_create", { title }),
  taskUpdate: (task: TaskItem) => invoke<TaskItem>("task_update", { task }),
  taskToggleDone: (taskId: string) =>
    invoke<TaskItem>("task_toggle_done", { taskId }),
  taskDelete: (taskId: string) => invoke<void>("task_delete", { taskId }),

  matrixGet: () => invoke<EisenhowerMatrixFile>("matrix_get"),
  matrixSetQuadrant: (taskId: string, quadrant: EisenhowerQuadrant) =>
    invoke<EisenhowerMatrixFile>("matrix_set_quadrant", { taskId, quadrant }),
  matrixRemoveItem: (itemId: string) =>
    invoke<EisenhowerMatrixFile>("matrix_remove_item", { itemId }),

  calendarList: () => invoke<CalendarTimeBlock[]>("calendar_list"),
  calendarSaveBlock: (block: CalendarTimeBlock) =>
    invoke<CalendarTimeBlock>("calendar_save_block", { block }),
  calendarDeleteBlock: (blockId: string) =>
    invoke<void>("calendar_delete_block", { blockId }),

  metricsGet: () => invoke<ConsistencyMetric>("metrics_get"),
  activityDailyTotals: (days: number) =>
    invoke<DailyFocus[]>("activity_daily_totals", { days }),

  configGet: () => invoke<AppConfig>("config_get"),
  configSave: (config: AppConfig) => invoke<AppConfig>("config_save", { config }),

  layoutGet: () => invoke<WidgetLayout>("layout_get"),
  layoutSave: (layout: WidgetLayout) => invoke<void>("layout_save", { layout }),

  energyRecent: (days: number) => invoke<EnergyLogEntry[]>("energy_recent", { days }),
  energyLog: (level: number) => invoke<EnergyLogEntry>("energy_log", { level }),

  journalList: () => invoke<JournalEntry[]>("journal_list"),
  journalAdd: (text: string) => invoke<JournalEntry>("journal_add", { text }),
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
  timerSubscribe: (channel: Channel<TimerTickPayload>) =>
    invoke<void>("timer_subscribe", { channel }),
};
