import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  CalendarTimeBlock,
  ConsistencyMetric,
  EisenhowerMatrixFile,
  TaskItem,
  TimerTickPayload,
  WidgetLayout,
} from "@/types";

export const api = {
  getDataDir: () => invoke<string>("storage_get_data_dir"),

  tasksList: () => invoke<TaskItem[]>("tasks_list"),
  taskCreate: (title: string) => invoke<TaskItem>("task_create", { title }),
  taskUpdate: (task: TaskItem) => invoke<TaskItem>("task_update", { task }),

  matrixGet: () => invoke<EisenhowerMatrixFile>("matrix_get"),
  matrixSave: (matrix: EisenhowerMatrixFile) =>
    invoke<void>("matrix_save", { matrix }),

  calendarList: () => invoke<CalendarTimeBlock[]>("calendar_list"),
  calendarSaveBlock: (block: CalendarTimeBlock) =>
    invoke<CalendarTimeBlock>("calendar_save_block", { block }),
  calendarDeleteBlock: (blockId: string) =>
    invoke<void>("calendar_delete_block", { blockId }),

  metricsGet: () => invoke<ConsistencyMetric>("metrics_get"),

  configGet: () => invoke<AppConfig>("config_get"),
  configSave: (config: AppConfig) => invoke<AppConfig>("config_save", { config }),

  layoutGet: () => invoke<WidgetLayout>("layout_get"),
  layoutSave: (layout: WidgetLayout) => invoke<void>("layout_save", { layout }),

  timerGet: () => invoke<TimerTickPayload | null>("timer_get"),
  timerStart: (protocol?: string, durationMinutes?: number) =>
    invoke<TimerTickPayload>("timer_start", { protocol, durationMinutes }),
  timerPause: () => invoke<TimerTickPayload>("timer_pause"),
  timerResume: () => invoke<TimerTickPayload>("timer_resume"),
  timerReset: () => invoke<void>("timer_reset"),
  timerSkipPhase: () => invoke<TimerTickPayload>("timer_skip_phase"),
  timerSubscribe: (channel: unknown) =>
    invoke<void>("timer_subscribe", { channel }),
};
