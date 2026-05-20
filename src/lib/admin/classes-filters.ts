import {
  addDays,
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";
import type { ClassDeliveryMode, ClassSeriesStatus } from "@prisma/client";

export type AdminView = "calendar" | "list";
export type AdminAudience = "youth" | "adults" | "all";
export type AdminSpan = 1 | 3 | 7;

/** Parsed admin /classes URL state (searchParams). */
export type AdminClassesFilters = {
  view: AdminView;
  audience: AdminAudience;
  /** Only shown in UI when audience is youth; still parsed if present. */
  delivery: ClassDeliveryMode | null;
  schoolSlug: string | null;
  clubId: string | null;
  coachPersonId: string | null;
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

function parseView(v: string | undefined): AdminView {
  return v === "calendar" ? "calendar" : "list";
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

function parseSpan(v: string | undefined): AdminSpan {
  const n = parseInt(v ?? "7", 10);
  if (n === 1 || n === 3 || n === 7) return n as AdminSpan;
  return 7;
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

/** Range [start, end) for session queries — `end` is exclusive. */
export function calendarRangeEnd(rangeStart: Date, span: AdminSpan): Date {
  return addDays(rangeStart, span);
}

/** Shift anchor day by whole calendar days (Amsterdam). */
export function shiftCalendarFromISO(fromISO: string, dayDelta: number): string {
  const anchor = resolveCalendarAnchor(fromISO);
  const shifted = addDays(anchor, dayDelta);
  return formatLocalDate(shifted);
}

/** Human label for the visible calendar window, e.g. "21 Apr – 23 Apr 2026". */
export function formatAdminCalendarRangeLabel(
  fromISO: string,
  span: AdminSpan,
): string {
  const start = resolveCalendarAnchor(fromISO);
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
