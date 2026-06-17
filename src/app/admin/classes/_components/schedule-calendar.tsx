"use client";

import { useMemo } from "react";

/**
 * Shared schedule preview calendar, used both in the create cascade
 * (edit mode — click dates to toggle excluded/scheduled) and on the
 * locked edit page / list peek (read mode — just previews the planned
 * sessions with excluded dates in red).
 *
 * The grid walks month-by-month from the start month through the end
 * month. Every occurrence of `dayOfWeek` in the `[startsOn, endsOn]`
 * window renders green ("Lesson") unless it's in `excluded`, in which
 * case it renders red ("No lesson"). Non-lesson weekdays stay faded.
 */

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Props = {
  startsOn: string;
  endsOn: string;
  /** Ignored when `variant="camp"` (Mon–Fri in range). */
  dayOfWeek?: DayKey;
  excluded: Set<string>;
  /** `camp` = every weekday in the date range; default = single recurring weekday. */
  variant?: "weekly" | "camp";
} & (
  | { mode: "edit"; onToggle: (iso: string) => void }
  | { mode: "read"; onToggle?: undefined }
);

export function ScheduleCalendar(props: Props) {
  const {
    startsOn,
    endsOn,
    dayOfWeek = "mon",
    excluded,
    mode,
    variant = "weekly",
  } = props;
  const onToggle = mode === "edit" ? props.onToggle : undefined;
  const isCamp = variant === "camp";

  const start = parseIso(startsOn);
  const end = parseIso(endsOn);

  const preview = useMemo(() => {
    if (!start || !end || end < start) return null;
    const target = DAY_INDEX[dayOfWeek];
    const months: { year: number; month: number; weeks: Array<Array<Cell>> }[] = [];
    let scheduledCount = 0;

    const cursorMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    const endMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1),
    );

    while (cursorMonth <= endMonth) {
      const y = cursorMonth.getUTCFullYear();
      const m = cursorMonth.getUTCMonth();
      const firstDay = new Date(Date.UTC(y, m, 1));
      // Monday-start week: Mon=0 … Sun=6.
      const firstWeekday = (firstDay.getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

      const weeks: Array<Array<Cell>> = [];
      let week: Array<Cell> = Array.from({ length: firstWeekday }, () => ({
        kind: "empty",
      }));

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(Date.UTC(y, m, day));
        const iso = isoOf(d);
        const inRange = d >= start && d <= end;
        const dow = d.getUTCDay();
        const isCampWeekday = dow >= 1 && dow <= 5;
        const isScheduledWeekday = isCamp
          ? inRange && isCampWeekday
          : inRange && dow === target;
        let cell: Cell;
        if (!inRange || (isCamp ? !isCampWeekday : dow !== target)) {
          cell = { kind: "plain", day, iso };
        } else if (excluded.has(iso)) {
          cell = { kind: "excluded", day, iso };
        } else {
          cell = { kind: "scheduled", day, iso };
          scheduledCount += 1;
        }
        week.push(cell);
        if (week.length === 7) {
          weeks.push(week);
          week = [];
        }
      }
      if (week.length > 0) {
        while (week.length < 7) week.push({ kind: "empty" });
        weeks.push(week);
      }
      months.push({ year: y, month: m, weeks });
      cursorMonth.setUTCMonth(cursorMonth.getUTCMonth() + 1);
    }

    return { months, scheduledCount };
  }, [start?.getTime(), end?.getTime(), dayOfWeek, excluded, isCamp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!startsOn || !endsOn) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-strong)] p-4 text-xs text-[var(--muted-foreground)]">
        {isCamp
          ? "Pick the camp week start and end to preview camp days."
          : "Pick a start and end date to preview the session calendar."}
      </div>
    );
  }
  if (!preview || !start || !end) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-strong)] p-4 text-xs text-[var(--muted-foreground)]">
        End date must be after start date.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-strong)] p-4">
      <div className="flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
          <LegendDot className="bg-emerald-500/80" />{" "}
          {isCamp ? "Camp day" : "Lesson"}
          <LegendDot className="bg-rose-500/80" />{" "}
          {isCamp ? "Day off" : "No lesson"}
          <LegendDot className="bg-[var(--surface)] ring-1 ring-[var(--border)]" />{" "}
          {isCamp ? "Not a camp day" : "Not scheduled"}
        </div>
        <div className="font-medium text-[var(--foreground)]">
          {preview.scheduledCount}{" "}
          {isCamp ? "camp day" : "session"}
          {preview.scheduledCount === 1 ? "" : "s"}
          {excluded.size > 0 && (
            <span className="ml-1 text-[var(--muted-foreground)]">
              ({excluded.size} excluded)
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {preview.months.map(({ year, month, weeks }) => (
          <div key={`${year}-${month}`} className="space-y-2">
            <div className="text-xs font-medium text-[var(--foreground)]">
              {MONTH_NAMES[month]} {year}
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-[10px] text-[var(--muted-foreground)]">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i} className="px-1 py-0.5 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {weeks.flat().map((cell, i) => (
                <CalendarCell key={i} cell={cell} onToggle={onToggle} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Cell =
  | { kind: "empty" }
  | { kind: "plain"; day: number; iso: string }
  | { kind: "scheduled"; day: number; iso: string }
  | { kind: "excluded"; day: number; iso: string };

function CalendarCell({
  cell,
  onToggle,
}: {
  cell: Cell;
  onToggle: ((iso: string) => void) | undefined;
}) {
  if (cell.kind === "empty") {
    return <div className="h-7" aria-hidden />;
  }
  const base =
    "h-7 rounded text-[11px] leading-7 text-center transition-colors select-none";
  if (cell.kind === "plain") {
    return (
      <div className={`${base} text-[var(--muted-foreground)]/60`}>
        {cell.day}
      </div>
    );
  }
  if (cell.kind === "scheduled") {
    const className = `${base} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ${
      onToggle ? "hover:bg-emerald-500/25 cursor-pointer" : "cursor-default"
    }`;
    if (!onToggle) {
      return (
        <div className={className} title={`${cell.iso} — session`}>
          {cell.day}
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onToggle(cell.iso)}
        className={className}
        title={`${cell.iso} — session (click to exclude)`}
      >
        {cell.day}
      </button>
    );
  }
  const excludedClass = `${base} bg-rose-500/20 text-rose-700 dark:text-rose-300 line-through ${
    onToggle ? "hover:bg-rose-500/30 cursor-pointer" : "cursor-default"
  }`;
  if (!onToggle) {
    return (
      <div className={excludedClass} title={`${cell.iso} — no lesson`}>
        {cell.day}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onToggle(cell.iso)}
      className={excludedClass}
      title={`${cell.iso} — no lesson (click to restore)`}
    >
      {cell.day}
    </button>
  );
}

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${className}`} />;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_INDEX: Record<DayKey, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
