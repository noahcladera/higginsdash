import {
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
  addDays,
} from "@/lib/booking/time";

/**
 * Pure week-math helpers shared by the coach and member calendars.
 * Everything lives in Europe/Amsterdam terms: "a week" is Mon 00:00 →
 * next Mon 00:00 local.
 */

/**
 * Return the Monday 00:00 Europe/Amsterdam instant for the week
 * containing `date`. `date` is a UTC instant.
 */
export function mondayOfWeekUtc(date: Date): Date {
  const isoDay = formatLocalDate(date);
  const { year, month, day } = parseLocalDate(isoDay);
  // Figure out the local weekday by asking Intl directly.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(date);
  // Mon = 0 ... Sun = 6
  const mondayIndex: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = mondayIndex[weekday] ?? 0;
  const localMidnight = amsterdamMidnightUtc(year, month, day);
  return new Date(localMidnight.getTime() - offset * 24 * 60 * 60_000);
}

/**
 * Resolve a `?week=YYYY-MM-DD` query param to a Monday 00:00 Amsterdam
 * instant. Any day within the target week also works — we snap to its
 * Monday. Falls back to the current week when no valid param is given.
 */
export function resolveWeekStart(raw: string | undefined | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    try {
      const { year, month, day } = parseLocalDate(raw);
      const probe = amsterdamMidnightUtc(year, month, day);
      return mondayOfWeekUtc(probe);
    } catch {
      // fall through
    }
  }
  return mondayOfWeekUtc(new Date());
}

/** The 7 local-midnight instants for the Mon..Sun of `weekStart`. */
export function daysOfWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Consecutive local Amsterdam midnights starting at `rangeStart` (inclusive).
 * Used for admin calendar 1d / 3d / 7d windows anchored on any calendar day.
 */
export function daysInRange(rangeStart: Date, span: number): Date[] {
  const n = Math.min(7, Math.max(1, Math.floor(span)));
  return Array.from({ length: n }, (_, i) => addDays(rangeStart, i));
}

/** Key for a `?week=` query param: the Monday's local YYYY-MM-DD. */
export function weekParamOf(weekStart: Date): string {
  return formatLocalDate(weekStart);
}

/** Shift a Monday by N whole weeks (positive or negative). */
export function shiftWeeks(weekStart: Date, deltaWeeks: number): Date {
  return addDays(weekStart, deltaWeeks * 7);
}

const WEEK_RANGE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
});
const WEEK_RANGE_FMT_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "21 Apr – 27 Apr 2026" style label for a week. */
export function formatWeekRange(weekStart: Date): string {
  const sunday = addDays(weekStart, 6);
  return `${WEEK_RANGE_FMT.format(weekStart)} – ${WEEK_RANGE_FMT_YEAR.format(sunday)}`;
}
