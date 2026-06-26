import { addDays, formatLocalDate, parseLocalDate, amsterdamMidnightUtc } from "@/lib/booking/time";
import {
  formatWeekRange,
  mondayOfWeekUtc,
  weekParamOf,
} from "@/lib/calendar/week";

export type AdminDashboardPanel = "overview" | "schedule";

export type AdminScheduleFilters = {
  panel: AdminDashboardPanel;
  date: string;
  showTriaz: boolean;
  showRandwijck: boolean;
  showClasses: boolean;
  showBookings: boolean;
};

export type AdminScheduleHrefPatch = Partial<{
  panel: AdminDashboardPanel;
  date: string;
  showTriaz: boolean;
  showRandwijck: boolean;
  showClasses: boolean;
  showBookings: boolean;
}>;

function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseFlag(v: string | undefined, defaultOn: boolean): boolean {
  if (v === "0") return false;
  if (v === "1") return true;
  return defaultOn;
}

function parseDate(v: string | undefined): string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    try {
      parseLocalDate(v);
      return v;
    } catch {
      // fall through
    }
  }
  return formatLocalDate(new Date());
}

export function parseAdminScheduleFilters(
  sp: Record<string, string | string[] | undefined>,
): AdminScheduleFilters {
  const panelRaw = firstValue(sp.panel);
  const panel: AdminDashboardPanel =
    panelRaw === "schedule" ? "schedule" : "overview";

  return {
    panel,
    date: resolveScheduleWeekStart(parseDate(firstValue(sp.date))),
    showTriaz: parseFlag(firstValue(sp.triaz), true),
    showRandwijck: parseFlag(firstValue(sp.randwijck), true),
    showClasses: parseFlag(firstValue(sp.classes), true),
    showBookings: parseFlag(firstValue(sp.bookings), true),
  };
}

export function adminScheduleHref(
  filters: AdminScheduleFilters,
): string {
  const p = new URLSearchParams();
  if (filters.panel !== "overview") p.set("panel", filters.panel);
  if (filters.panel === "schedule") {
    const thisWeekMonday = resolveScheduleWeekStart(formatLocalDate(new Date()));
    if (filters.date !== thisWeekMonday) p.set("date", filters.date);
    if (!filters.showTriaz) p.set("triaz", "0");
    if (!filters.showRandwijck) p.set("randwijck", "0");
    if (!filters.showClasses) p.set("classes", "0");
    if (!filters.showBookings) p.set("bookings", "0");
  }
  const q = p.toString();
  return q ? `/admin?${q}` : "/admin";
}

export function adminScheduleHrefPatch(
  filters: AdminScheduleFilters,
  patch: AdminScheduleHrefPatch,
): string {
  return adminScheduleHref({ ...filters, ...patch });
}

export function shiftScheduleDate(date: string, dayDelta: number): string {
  const parsed = parseLocalDate(date);
  const utc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
  const shifted = new Date(utc.getTime() + dayDelta * 86_400_000);
  return formatLocalDate(shifted);
}

/** Snap any local date to the Monday of its ISO week. */
export function resolveScheduleWeekStart(date: string): string {
  const parsed = parseLocalDate(date);
  const probe = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
  return weekParamOf(mondayOfWeekUtc(probe));
}

/** Shift a week anchor by whole weeks (date must already be a Monday). */
export function shiftScheduleWeek(date: string, weekDelta: number): string {
  const parsed = parseLocalDate(date);
  const utc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
  return formatLocalDate(addDays(utc, weekDelta * 7));
}

export function currentScheduleWeekStart(): string {
  return resolveScheduleWeekStart(formatLocalDate(new Date()));
}

export function formatScheduleWeekLabel(weekStart: string): string {
  const parsed = parseLocalDate(weekStart);
  const utc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
  return formatWeekRange(utc);
}

export function scheduleClubSlugs(
  filters: AdminScheduleFilters,
): ("triaz" | "randwijck")[] {
  const slugs: ("triaz" | "randwijck")[] = [];
  if (filters.showTriaz) slugs.push("triaz");
  if (filters.showRandwijck) slugs.push("randwijck");
  return slugs;
}

export function formatScheduleDayLabel(date: string): string {
  const parsed = parseLocalDate(date);
  const utc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(utc);
}
