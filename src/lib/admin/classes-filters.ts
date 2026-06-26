import {
  addDays,
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";
import { mondayOfWeekUtc } from "@/lib/calendar/week";
import type { ClassDeliveryMode, ClassSeriesStatus, DayOfWeek } from "@prisma/client";

export type AdminView = "calendar" | "list";
export type AdminAudience = "youth" | "adults" | "all";
export type AdminSpan = 1 | 3 | 7;

export type AdminGroupBy = "program-season" | "flat";

/** Parsed admin /classes URL state (searchParams). */
export type AdminClassesFilters = {
  view: AdminView;
  audience: AdminAudience;
  /** Only shown in UI when audience is youth; still parsed if present. */
  delivery: ClassDeliveryMode | null;
  schoolSlug: string | null;
  clubId: string | null;
  coachPersonId: string | null;
  dayOfWeek: DayOfWeek | null;
  programSlug: string | null;
  seasonId: string | null;
  /** Narrow to one class series (wins over program/season). */
  seriesId: string | null;
  groupBy: AdminGroupBy;
  /** Narrow series by status; `null` = use default time-based visibility (no extra status chip). */
  seriesStatus: ClassSeriesStatus | "all" | null;
  /** `true` = include past-ended series (same as legacy `all=1`). */
  includeAllSeries: boolean;
  q: string;
  /** Amsterdam local day YYYY-MM-DD for calendar anchor. */
  fromISO: string;
  span: AdminSpan;
};

const SPANS: AdminSpan[] = [1, 3, 7];

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Default calendar anchor: today in Europe/Amsterdam. */
export function defaultCalendarFromISO(): string {
  return formatLocalDate(new Date());
}

/**
 * Resolve `?from=YYYY-MM-DD` to Amsterdam midnight UTC; invalid/missing → today.
 */
export function resolveCalendarAnchor(raw: string | undefined | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    try {
      const { year, month, day } = parseLocalDate(raw);
      return amsterdamMidnightUtc(year, month, day);
    } catch {
      // fall through
    }
  }
  const iso = defaultCalendarFromISO();
  const { year, month, day } = parseLocalDate(iso);
  return amsterdamMidnightUtc(year, month, day);
}

function parseView(_v: string | undefined): AdminView {
  return "list";
}

function parseAudience(v: string | undefined): AdminAudience {
  if (v === "youth" || v === "adults" || v === "all") return v;
  return "all";
}

function parseDelivery(v: string | undefined): ClassDeliveryMode | null {
  if (v === "pickup" || v === "at_club" || v === "onsite") return v;
  return null;
}

const SERIES_STATUS_VALUES: ClassSeriesStatus[] = [
  "draft",
  "published",
  "full",
  "in_progress",
  "completed",
  "cancelled",
];

function parseSeriesStatus(
  v: string | undefined,
): ClassSeriesStatus | "all" | null {
  if (!v || v === "any") return null;
  if (v === "all") return "all";
  if (SERIES_STATUS_VALUES.includes(v as ClassSeriesStatus)) {
    return v as ClassSeriesStatus;
  }
  return null;
}

const DAY_OF_WEEK_VALUES: DayOfWeek[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

function parseDayOfWeek(v: string | undefined): DayOfWeek | null {
  if (!v) return null;
  return DAY_OF_WEEK_VALUES.includes(v as DayOfWeek)
    ? (v as DayOfWeek)
    : null;
}

function parseGroupBy(v: string | undefined): AdminGroupBy {
  return v === "flat" ? "flat" : "program-season";
}

function parseSpan(v: string | undefined): AdminSpan {
  const n = parseInt(v ?? "1", 10);
  if (n === 1 || n === 3 || n === 7) return n as AdminSpan;
  return 1;
}

/**
 * Parse Next.js `searchParams` into {@link AdminClassesFilters}.
 */
export function parseAdminClassesFilters(
  sp: Record<string, string | string[] | undefined>,
): AdminClassesFilters {
  const q = (firstValue(sp.q) ?? "").trim();
  const includeAllSeries = firstValue(sp.all) === "1";
  return {
    view: parseView(firstValue(sp.view)),
    audience: parseAudience(firstValue(sp.audience)),
    delivery: parseDelivery(firstValue(sp.delivery)),
    schoolSlug: (firstValue(sp.school) ?? "").trim() || null,
    clubId: (firstValue(sp.club) ?? "").trim() || null,
    coachPersonId: (firstValue(sp.coach) ?? "").trim() || null,
    dayOfWeek: parseDayOfWeek(firstValue(sp.day)),
    programSlug: (firstValue(sp.program) ?? "").trim() || null,
    seasonId: (firstValue(sp.season) ?? "").trim() || null,
    seriesId: (firstValue(sp.series) ?? "").trim() || null,
    groupBy: parseGroupBy(firstValue(sp.group)),
    seriesStatus: parseSeriesStatus(firstValue(sp.status)),
    includeAllSeries,
    q,
    fromISO: (() => {
      const raw = firstValue(sp.from);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      return defaultCalendarFromISO();
    })(),
    span: parseSpan(firstValue(sp.span)),
  };
}

/**
 * Calendar range start for session queries. Week view (`span === 7`) snaps
 * to Monday of the week containing the anchor day.
 */
export function resolveCalendarRangeStart(
  fromISO: string,
  span: AdminSpan,
): Date {
  const anchor = resolveCalendarAnchor(fromISO);
  if (span === 7) return mondayOfWeekUtc(anchor);
  return anchor;
}

/** Monday (YYYY-MM-DD) of the week containing today in Amsterdam. */
export function weekContainingTodayISO(): string {
  return formatLocalDate(mondayOfWeekUtc(new Date()));
}

/** Range [start, end) for session queries — `end` is exclusive. */
export function calendarRangeEnd(rangeStart: Date, span: AdminSpan): Date {
  return addDays(rangeStart, span);
}

/** Shift anchor day by whole calendar days (Amsterdam). Week view shifts by whole weeks. */
export function shiftCalendarFromISO(
  fromISO: string,
  dayDelta: number,
  span: AdminSpan = 7,
): string {
  const start = resolveCalendarRangeStart(fromISO, span);
  const delta = span === 7 ? (dayDelta >= 0 ? 7 : -7) * Math.sign(dayDelta || 1) : dayDelta;
  const shifted = addDays(start, delta);
  return formatLocalDate(shifted);
}

/** Whether the visible calendar window contains today (Amsterdam). */
export function calendarWindowContainsToday(
  fromISO: string,
  span: AdminSpan,
): boolean {
  const start = resolveCalendarRangeStart(fromISO, span);
  const end = calendarRangeEnd(start, span);
  const today = resolveCalendarAnchor(defaultCalendarFromISO());
  return today >= start && today < end;
}

/** Human label for the visible calendar window, e.g. "21 Apr – 23 Apr 2026". */
export function formatAdminCalendarRangeLabel(
  fromISO: string,
  span: AdminSpan,
): string {
  const start = resolveCalendarRangeStart(fromISO, span);
  const end = addDays(start, span - 1);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "short",
  });
  const fmtY = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (formatLocalDate(start) === formatLocalDate(end)) {
    return fmtY.format(start);
  }
  return `${fmt.format(start)} – ${fmtY.format(end)}`;
}

export { SPANS as ADMIN_CALENDAR_SPANS };
