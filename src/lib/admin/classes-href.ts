import type { ClassDeliveryMode, ClassSeriesStatus, DayOfWeek } from "@prisma/client";
import {
  defaultCalendarFromISO,
  type AdminClassesFilters,
  type AdminGroupBy,
  type AdminSpan,
  type AdminView,
} from "@/lib/admin/classes-filters";

export type AdminClassesHrefPatch = Partial<{
  view: AdminView;
  audience: AdminClassesFilters["audience"];
  delivery: ClassDeliveryMode | null;
  schoolSlug: string | null;
  clubId: string | null;
  coachPersonId: string | null;
  dayOfWeek: DayOfWeek | null;
  programSlug: string | null;
  seasonId: string | null;
  seriesId: string | null;
  groupBy: AdminGroupBy;
  seriesStatus: ClassSeriesStatus | "all" | null;
  includeAllSeries: boolean;
  q: string;
  fromISO: string;
  span: AdminSpan;
}>;

/** Apply patch with cascade rules (youth → format → school). */
export function patchAdminClassesFilters(
  f: AdminClassesFilters,
  patch: AdminClassesHrefPatch,
): AdminClassesFilters {
  let next: AdminClassesFilters = { ...f, ...patch };

  if (patch.audience !== undefined) {
    if (patch.audience !== "youth") {
      next = { ...next, delivery: null, schoolSlug: null };
    }
  }

  if (patch.delivery !== undefined) {
    if (patch.delivery !== "pickup") {
      next = { ...next, schoolSlug: null };
    }
  }

  if (patch.programSlug !== undefined && patch.seasonId === undefined) {
    next = { ...next, seasonId: null, seriesId: null };
  }
  if (patch.seasonId !== undefined && patch.seriesId === undefined) {
    next = { ...next, seriesId: null };
  }

  return next;
}

/** Serialize filters to query string (omit defaults). */
export function adminClassesHref(f: AdminClassesFilters): string {
  const p = new URLSearchParams();

  if (f.view !== "list") p.set("view", f.view);
  if (f.audience !== "all") p.set("audience", f.audience);
  if (f.delivery) p.set("delivery", f.delivery);
  if (f.schoolSlug) p.set("school", f.schoolSlug);
  if (f.clubId) p.set("club", f.clubId);
  if (f.coachPersonId) p.set("coach", f.coachPersonId);
  if (f.dayOfWeek) p.set("day", f.dayOfWeek);
  if (f.programSlug) p.set("program", f.programSlug);
  if (f.seasonId) p.set("season", f.seasonId);
  if (f.seriesId) p.set("series", f.seriesId);
  if (f.groupBy === "flat") p.set("group", "flat");
  if (f.seriesStatus === "all") {
    p.set("status", "all");
  } else if (f.seriesStatus) {
    p.set("status", f.seriesStatus);
  }
  if (f.includeAllSeries) p.set("all", "1");
  if (f.q) p.set("q", f.q);

  if (f.fromISO !== defaultCalendarFromISO()) p.set("from", f.fromISO);
  if (f.span !== 1) p.set("span", String(f.span));

  const s = p.toString();
  return s ? `?${s}` : "?";
}

export function adminClassesHrefPatch(
  f: AdminClassesFilters,
  patch: AdminClassesHrefPatch,
): string {
  return adminClassesHref(patchAdminClassesFilters(f, patch));
}

/** Filters for loading the full tree (ignore hierarchy selection). */
export function filtersForClassTree(
  filters: AdminClassesFilters,
): AdminClassesFilters {
  return patchAdminClassesFilters(filters, {
    programSlug: null,
    seasonId: null,
    seriesId: null,
  });
}
