import { useCallback, useMemo, useRef, useState } from "react";
import { useWheelPeriodNav } from "@/hooks/useWheelPeriodNav";
import type { CalendarTimeBlock, TaskItem } from "@/types";
import { formatClockLabel } from "@/lib/schedule";
import { resolveBlockColor } from "@/lib/constellations";
import { PressableEnergy, Surface } from "@/ui/kit";

export interface MonthCalendarViewProps {
  blocks: CalendarTimeBlock[];
  tasks: TaskItem[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onAddBlockAtDate?: (date: Date) => void;
  onEditBlock?: (block: CalendarTimeBlock) => void;
  onSwitchToDayView?: (date: Date) => void;
  onSwitchToWeekView?: () => void;
  mode?: "month" | "year";
  onModeChange?: (mode: "month" | "year") => void;
  initialMode?: "month" | "year";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthCalendarView({
  blocks,
  selectedDate,
  onSelectDate,
  onAddBlockAtDate,
  onEditBlock,
  onSwitchToDayView,
  onSwitchToWeekView,
  mode: modeProp,
  onModeChange,
  initialMode = "month",
}: MonthCalendarViewProps) {
  const [internalMode, setInternalMode] = useState<"month" | "year">(initialMode);
  const mode = modeProp ?? internalMode;

  function setMode(m: "month" | "year") {
    setInternalMode(m);
    onModeChange?.(m);
  }

  const [currentYear, setCurrentYear] = useState(() => selectedDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => selectedDate.getMonth());

  const today = useMemo(() => new Date(), []);

  function handlePrev() {
    if (mode === "month") {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear((y) => y - 1);
      } else {
        setCurrentMonth((m) => m - 1);
      }
    } else {
      setCurrentYear((y) => y - 1);
    }
  }

  function handleNext() {
    if (mode === "month") {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear((y) => y + 1);
      } else {
        setCurrentMonth((m) => m + 1);
      }
    } else {
      setCurrentYear((y) => y + 1);
    }
  }

  function handleToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    onSelectDate(now);
  }

  const periodNavRef = useRef<HTMLDivElement>(null);
  const onPeriodWheel = useCallback(
    (step: -1 | 1) => {
      if (step > 0) handleNext();
      else handlePrev();
    },
    [mode, currentMonth, currentYear],
  );
  useWheelPeriodNav(periodNavRef, onPeriodWheel);

  // Generate days grid for currentMonth
  const monthDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: {
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      dayNum: number;
    }[] = [];

    // Days from previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1, daysInPrevMonth - i);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: d.toDateString() === today.toDateString(),
        isSelected: d.toDateString() === selectedDate.toDateString(),
        dayNum: d.getDate(),
      });
    }

    // Days from current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        isSelected: date.toDateString() === selectedDate.toDateString(),
        dayNum: d,
      });
    }

    // Days from next month to fill grid up to 35 or 42 slots
    const totalSlots = days.length <= 35 ? 35 : 42;
    let nextMonthDay = 1;
    while (days.length < totalSlots) {
      const date = new Date(currentYear, currentMonth + 1, nextMonthDay++);
      days.push({
        date,
        isCurrentMonth: false,
        isToday: date.toDateString() === today.toDateString(),
        isSelected: date.toDateString() === selectedDate.toDateString(),
        dayNum: date.getDate(),
      });
    }

    return days;
  }, [currentYear, currentMonth, today, selectedDate]);

  // Group blocks by date ISO key for quick lookup
  const blocksByDayKey = useMemo(() => {
    const map = new Map<string, CalendarTimeBlock[]>();
    for (const b of blocks) {
      const key = new Date(b.startAt).toDateString();
      const existing = map.get(key) ?? [];
      existing.push(b);
      map.set(key, existing);
    }
    return map;
  }, [blocks]);

  return (
    <div style={container} className="sb-schedule-view">
      {/* Header & Controls */}
      <div style={headerRow}>
        <div style={navGroup}>
          <div style={viewToggle}>
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={mode === "month" ? toggleActive : toggleBtn}
              onClick={() => setMode("month")}
            >
              Month
            </button>
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={mode === "year" ? toggleActive : toggleBtn}
              onClick={() => setMode("year")}
            >
              Year
            </button>
          </div>

          <div
            ref={periodNavRef}
            style={monthNav}
            title={mode === "month" ? "Scroll to change month" : "Scroll to change year"}
          >
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={iconBtn}
              onClick={handlePrev}
              title={mode === "month" ? "Previous Month" : "Previous Year"}
              aria-label="Previous"
            >
              ◀
            </button>

            <h2 style={titleHeading}>
              {mode === "month" ? `${MONTH_NAMES[currentMonth]} ${currentYear}` : `${currentYear}`}
            </h2>

            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={iconBtn}
              onClick={handleNext}
              title={mode === "month" ? "Next Month" : "Next Year"}
              aria-label="Next"
            >
              ▶
            </button>

            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={todayBtn}
              onClick={handleToday}
            >
              Today
            </button>
          </div>
        </div>

        <div style={actionsGroup}>
          {onSwitchToDayView && (
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={dayScheduleBtn}
              onClick={() => onSwitchToDayView(selectedDate)}
              title="Open hourly timeline schedule for selected date"
            >
              Day Schedule ⏱
            </button>
          )}

          {onSwitchToWeekView && (
            <button
              type="button"
              className="sb-pressable sb-pressable-hover"
              style={dayScheduleBtn}
              onClick={onSwitchToWeekView}
              title="Open 7-day timeline schedule"
            >
              Week Schedule ◷
            </button>
          )}

          {onAddBlockAtDate && (
            <PressableEnergy
              variant="primary"
              onClick={() => onAddBlockAtDate(selectedDate)}
            >
              + Add time block
            </PressableEnergy>
          )}
        </div>
      </div>

      {/* Month View */}
      {mode === "month" && (
        <Surface padding="md" variant="overlay" style={monthSurface}>
          {/* Weekday headers */}
          <div style={weekdayRow}>
            {WEEKDAY_NAMES.map((w) => (
              <div key={w} style={weekdayCol}>
                {w}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="sb-schedule-scroll">
            <div style={daysGrid}>
            {monthDays.map((item) => {
              const dayKey = item.date.toDateString();
              const dayBlocks = blocksByDayKey.get(dayKey) ?? [];
              const isSelected = item.isSelected;
              const isToday = item.isToday;

              return (
                <div
                  key={dayKey}
                  style={{
                    ...dayCell,
                    opacity: item.isCurrentMonth ? 1 : 0.42,
                    ...(isSelected ? dayCellSelected : {}),
                    ...(isToday ? dayCellToday : {}),
                  }}
                  onClick={() => onSelectDate(item.date)}
                  onDoubleClick={() => onSwitchToDayView?.(item.date)}
                >
                  <div style={dayHeader}>
                    <span
                      style={{
                        ...dayNumber,
                        ...(isToday ? todayBadge : {}),
                      }}
                    >
                      {item.dayNum}
                    </span>
                    {dayBlocks.length > 0 && (
                      <span style={blockCountBadge}>
                        {dayBlocks.length} {dayBlocks.length === 1 ? "block" : "blocks"}
                      </span>
                    )}
                  </div>

                  <div className="sb-schedule-scroll sb-schedule-scroll--cell" style={blockPillContainer}>
                    {dayBlocks.map((b) => {
                      const start = new Date(b.startAt);
                      const color = resolveBlockColor(b.colorToken ?? b.kind ?? "focus");
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className="sb-pressable"
                          style={{
                            ...blockPill,
                            borderLeft: `3px solid ${color}`,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDate(item.date);
                            onEditBlock?.(b);
                          }}
                          title={`${b.title} (${formatClockLabel(start.getHours(), start.getMinutes())})`}
                        >
                          <span style={pillTime}>
                            {formatClockLabel(start.getHours(), start.getMinutes())}
                          </span>
                          <span style={pillTitle}>{b.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </Surface>
      )}

      {/* Year View */}
      {mode === "year" && (
        <div className="sb-schedule-scroll">
        <div style={yearGrid}>
          {MONTH_NAMES.map((mName, mIndex) => {
            const firstDay = new Date(currentYear, mIndex, 1).getDay();
            const daysCount = new Date(currentYear, mIndex + 1, 0).getDate();

            // Count blocks in this month
            let monthBlockCount = 0;
            const daysWithBlocks = new Set<number>();
            for (const b of blocks) {
              const bDate = new Date(b.startAt);
              if (bDate.getFullYear() === currentYear && bDate.getMonth() === mIndex) {
                monthBlockCount++;
                daysWithBlocks.add(bDate.getDate());
              }
            }

            const isCurrentViewingMonth =
              currentYear === today.getFullYear() && mIndex === today.getMonth();

            return (
              <Surface
                key={mName}
                padding="sm"
                variant="raised"
                style={{
                  ...yearMonthCard,
                  ...(isCurrentViewingMonth ? yearMonthCardCurrent : {}),
                }}
                className="sb-pressable sb-pressable-hover"
                onClick={() => {
                  setCurrentMonth(mIndex);
                  setMode("month");
                }}
              >
                <div style={yearMonthHeader}>
                  <strong style={yearMonthTitle}>{mName}</strong>
                  {monthBlockCount > 0 && (
                    <span style={yearMonthBadge}>{monthBlockCount} blocks</span>
                  )}
                </div>

                {/* Mini calendar grid */}
                <div style={miniGrid}>
                  {WEEKDAY_NAMES.map((d) => (
                    <span key={d} style={miniWeekday}>
                      {d[0]}
                    </span>
                  ))}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <span key={`empty-${i}`} style={miniEmptyCell} />
                  ))}
                  {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => {
                    const hasBlock = daysWithBlocks.has(d);
                    const isTodayCell =
                      isCurrentViewingMonth && d === today.getDate();

                    return (
                      <span
                        key={d}
                        style={{
                          ...miniDayCell,
                          ...(isTodayCell ? miniTodayCell : {}),
                          ...(hasBlock ? miniBlockCell : {}),
                        }}
                        title={`${mName} ${d}${hasBlock ? " · Has study sessions" : ""}`}
                      >
                        {d}
                      </span>
                    );
                  })}
                </div>
              </Surface>
            );
          })}
        </div>
        </div>
      )}
    </div>
  );
}

/* Styles */
const container = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--sb-space-md)",
  width: "100%",
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap" as const,
  gap: "var(--sb-space-md)",
};

const navGroup = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sb-space-md)",
  flexWrap: "wrap" as const,
};

const viewToggle = {
  display: "flex",
  background: "var(--sb-bg-base)",
  borderRadius: "var(--sb-radius-sm)",
  padding: "2px",
  border: "1px solid var(--sb-border-subtle)",
};

const toggleBtn = {
  padding: "6px 14px",
  border: "none",
  background: "transparent",
  color: "var(--sb-text-secondary)",
  borderRadius: "var(--sb-radius-sm)",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const toggleActive = {
  ...toggleBtn,
  background: "var(--sb-bg-overlay)",
  color: "var(--sb-accent)",
  boxShadow: "0 0 8px var(--sb-glow-accent)",
};

const monthNav = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const iconBtn = {
  padding: "6px 10px",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  borderRadius: "var(--sb-radius-sm)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
};

const todayBtn = {
  padding: "6px 12px",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-secondary)",
  borderRadius: "var(--sb-radius-sm)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
};

const titleHeading = {
  margin: 0,
  fontSize: "18px",
  fontWeight: 600,
  minWidth: "170px",
  textAlign: "center" as const,
  color: "var(--sb-text-primary)",
};

const actionsGroup = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const dayScheduleBtn = {
  padding: "8px 14px",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  color: "var(--sb-text-primary)",
  borderRadius: "var(--sb-radius-sm)",
  cursor: "pointer",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 500,
};

const monthSurface = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "4px",
  flex: 1,
  minHeight: 0,
  border: "1px solid var(--sb-border-subtle)",
  borderRadius: "var(--sb-radius-lg)",
  overflow: "hidden",
  background: "var(--sb-bg-overlay)",
};

const weekdayRow = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "4px",
  borderBottom: "1px solid var(--sb-border-subtle)",
  paddingBottom: "8px",
  marginBottom: "4px",
};

const weekdayCol = {
  textAlign: "center" as const,
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--sb-text-muted)",
};

const daysGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "4px",
};

const dayCell = {
  minHeight: "105px",
  padding: "6px",
  borderRadius: "var(--sb-radius-sm)",
  border: "1px solid var(--sb-border-subtle)",
  background: "var(--sb-bg-base)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "4px",
  cursor: "pointer",
  transition: "all var(--sb-duration-fast) var(--sb-ease-out)",
};

const dayCellSelected = {
  borderColor: "var(--sb-border-glow)",
  boxShadow: "0 0 10px var(--sb-glow-accent)",
  background: "rgba(255, 255, 255, 0.03)",
};

const dayCellToday = {
  borderTop: "2px solid var(--sb-accent)",
};

const dayHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const dayNumber = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--sb-text-primary)",
  width: "22px",
  height: "22px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
};

const todayBadge = {
  background: "var(--sb-accent)",
  color: "#fff",
};

const blockCountBadge = {
  fontSize: "10px",
  color: "var(--sb-text-muted)",
};

const blockPillContainer = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "3px",
  flex: 1,
};

const blockPill = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "rgba(255, 255, 255, 0.05)",
  border: "none",
  color: "var(--sb-text-primary)",
  fontSize: "11px",
  textAlign: "left" as const,
  cursor: "pointer",
  overflow: "hidden",
  whiteSpace: "nowrap" as const,
  textOverflow: "ellipsis",
  width: "100%",
};

const pillTime = {
  fontSize: "10px",
  color: "var(--sb-text-muted)",
  flexShrink: 0,
};

const pillTitle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const yearGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "var(--sb-space-md)",
};

const yearMonthCard = {
  cursor: "pointer",
  borderRadius: "var(--sb-radius-md)",
  border: "1px solid var(--sb-border-subtle)",
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
};

const yearMonthCardCurrent = {
  borderColor: "var(--sb-border-glow)",
  boxShadow: "0 0 10px var(--sb-glow-accent)",
};

const yearMonthHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const yearMonthTitle = {
  fontSize: "14px",
  color: "var(--sb-text-primary)",
};

const yearMonthBadge = {
  fontSize: "11px",
  color: "var(--sb-accent)",
  background: "rgba(255, 255, 255, 0.06)",
  padding: "2px 6px",
  borderRadius: "999px",
};

const miniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: "3px",
  textAlign: "center" as const,
};

const miniWeekday = {
  fontSize: "9px",
  color: "var(--sb-text-muted)",
  fontWeight: 600,
};

const miniEmptyCell = {
  height: "18px",
};

const miniDayCell = {
  height: "18px",
  fontSize: "10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "2px",
  color: "var(--sb-text-secondary)",
};

const miniTodayCell = {
  background: "rgba(255, 255, 255, 0.12)",
  color: "var(--sb-text-primary)",
  fontWeight: 700,
};

const miniBlockCell = {
  background: "var(--sb-accent-dim)",
  color: "var(--sb-text-primary)",
  fontWeight: 600,
};
