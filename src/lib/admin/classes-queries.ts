import type { DayOfWeek, Prisma, ProgramTargetAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { computeClassTiming, type ClassDeliveryMode as TimingMode } from "@/lib/classes/timing";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import type { ClassSummaryProps } from "@/app/admin/classes/_components/class-summary-card";

/**
 * Shared Prisma where for class series lists + session queries that
 * scope through `classSeries`.
 *
 * `kind` controls the classType bucket:
 *   - "class" (default) — everything except `event` + `camp` rows.
 *   - "event" — just `event` rows.
 *   - "camp" — just `camp` rows.
 */
export function buildClassSeriesWhere(
  filters: AdminClassesFilters,
  kind: "class" | "event" | "camp" = "class",
): Prisma.ClassSeriesWhereInput {
  const now = new Date();
  const parts: Prisma.ClassSeriesWhereInput[] = [];

  // Soft-archived classes (deleted via the kebab menu when they had
  // real enrollments / completed sessions) stay in the DB for history
  // but disappear from every admin surface.
  parts.push({ archivedAt: null });

  if (kind === "event") {
    parts.push({ classType: "event" });
  } else if (kind === "camp") {
    parts.push({ classType: "camp" });
  } else {
    parts.push({ classType: { notIn: ["event", "camp"] } });
  }

  // Time visibility (legacy behaviour)
  if (!filters.includeAllSeries) {
    parts.push({
      OR: [
        { endsOn: { gte: now } },
        { status: { in: ["draft", "published"] } },
      ],
    });
  }

  // Audience
  if (filters.audience === "youth") {
    parts.push({
      program: { targetAudience: { in: ["kids", "mixed"] } },
    });
  } else if (filters.audience === "adults") {
    parts.push({
      program: { targetAudience: { in: ["adults", "mixed"] } },
    });
  }

  // Delivery / school (school only meaningful with pickup)
  if (filters.delivery) {
    parts.push({ deliveryMode: filters.delivery });
  }
  if (filters.delivery === "pickup" && filters.schoolSlug) {
    parts.push({
      school: { slug: filters.schoolSlug },
    });
  }

  // Destination club (venue's club)
  if (filters.clubId) {
    parts.push({ venue: { clubId: filters.clubId } });
  }

  // Coach assigned to series
  if (filters.coachPersonId) {
    parts.push({
      coaches: { some: { coachPersonId: filters.coachPersonId } },
    });
  }

  // Explicit series status chip
  if (filters.seriesStatus && filters.seriesStatus !== "all") {
    parts.push({ status: filters.seriesStatus });
  }

  // Free-text search
  const q = filters.q.trim();
  if (q) {
    parts.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { program: { name: { contains: q, mode: "insensitive" } } },
        { season: { name: { contains: q, mode: "insensitive" } } },
        { venue: { name: { contains: q, mode: "insensitive" } } },
        { school: { name: { contains: q, mode: "insensitive" } } },
        {
          coaches: {
            some: {
              coach: {
                person: {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        },
      ],
    });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export type AdminCalendarSession = {
  sessionId: string;
  classSeriesId: string;
  seriesName: string;
  programName: string;
  programTargetAudience: ProgramTargetAudience;
  deliveryMode: TimingMode;
  venueName: string;
  clubId: string | null;
  clubName: string | null;
  schoolName: string | null;
  dayOfWeek: DayOfWeek | null;
  leaveAt: Date | null;
  pickupAt: Date | null;
  classStartAt: Date;
  classEndAt: Date;
  summary: ClassSummaryProps;
};

type SeriesForSummary = {
  name: string;
  deliveryMode: "at_club" | "onsite" | "pickup";
  dayOfWeek: DayOfWeek | null;
  startTime: Date;
  endTime: Date;
  pickupAt: Date | null;
  startsOn: Date;
  endsOn: Date;
  maxStudents: number;
  minStudents: number | null;
  program: { name: string };
  season: { name: string } | null;
  venue: { name: string };
  school: { name: string } | null;
  coaches: Array<{
    role: string;
    coach: {
      personId: string;
      person: { firstName: string | null; lastName: string | null };
    };
  }>;
  groups: Array<{
    name: string;
    endTime: Date;
    minAge: number | null;
    maxAge: number | null;
    maxStudents: number;
    archivedAt: Date | null;
    _count: { enrollments: number };
  }>;
  _count: { enrollments: number; sessions: number };
};

function toSummary(
  series: SeriesForSummary,
  excludedCount: number,
): ClassSummaryProps {
  const leadRow = series.coaches.find((c) => c.role === "lead");
  const assistantRows = series.coaches.filter((c) => c.role === "assistant");
  const coachName = (c: SeriesForSummary["coaches"][0]) => {
    if (c.coach.personId === SYSTEM_NO_COACH_PERSON_ID) return "NO COACH YET";
    return (
      [c.coach.person.firstName, c.coach.person.lastName]
        .filter(Boolean)
        .join(" ") || "—"
    );
  };
  const leadCoachName = leadRow ? coachName(leadRow) : "NO COACH YET";
  const assistantCoachNames = assistantRows.map(coachName);

  const timeToHHMM = (d: Date) => {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };
  const dateToISO = (d: Date) => d.toISOString().slice(0, 10);

  return {
    name: series.name,
    programName: series.program.name,
    seasonName: series.season?.name ?? null,
    deliveryMode: series.deliveryMode,
    venueName: series.venue.name,
    schoolName: series.school?.name ?? null,
    dayOfWeek: series.dayOfWeek ?? null,
    startTimeHHMM: timeToHHMM(series.startTime),
    endTimeHHMM: timeToHHMM(series.endTime),
    pickupAtHHMM: series.pickupAt ? timeToHHMM(series.pickupAt) : null,
    startsOnISO: dateToISO(series.startsOn),
    endsOnISO: dateToISO(series.endsOn),
    leadCoachName,
    assistantCoachNames,
    enrolled: series._count.enrollments,
    maxStudents: series.maxStudents,
    minStudents: series.minStudents ?? null,
    sessionsTotal: series._count.sessions,
    sessionsExcluded: excludedCount,
    subGroups: (series.groups ?? [])
      .filter((g) => g.archivedAt == null)
      .map((g) => ({
        name: g.name,
        endTimeHHMM: timeToHHMM(g.endTime),
        minAge: g.minAge,
        maxAge: g.maxAge,
        enrolled: g._count.enrollments,
        maxStudents: g.maxStudents,
      })),
  };
}

const CLASS_SERIES_FOR_SESSION = {
  program: { select: { name: true, targetAudience: true } },
  season: { select: { name: true } },
  venue: {
    select: {
      name: true,
      club: { select: { id: true, name: true } },
    },
  },
  school: {
    select: {
      name: true,
      coachArriveAtHubMinutes: true,
    },
  },
  coaches: {
    include: {
      coach: {
        select: {
          personId: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
  groups: {
    orderBy: { displayOrder: "asc" },
    select: {
      name: true,
      endTime: true,
      minAge: true,
      maxAge: true,
      maxStudents: true,
      archivedAt: true,
      _count: { select: { enrollments: true } },
    },
  },
  _count: {
    select: {
      enrollments: { where: { status: "active" as const } },
      sessions: true,
    },
  },
} satisfies Prisma.ClassSeriesInclude;

/**
 * Sessions in `[rangeStart, rangeEnd)` matching admin filters, with timing
 * anchors for the calendar grid.
 */
export async function listSessionsForAdmin(
  filters: AdminClassesFilters,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<AdminCalendarSession[]> {
  const seriesWhere = buildClassSeriesWhere(filters);

  const rows = await prisma.classSession.findMany({
    where: {
      startsAt: { gte: rangeStart, lt: rangeEnd },
      cancelledAt: null,
      status: { not: "cancelled" },
      classSeries: seriesWhere,
    },
    orderBy: { startsAt: "asc" },
    include: {
      classSeries: {
        include: CLASS_SERIES_FOR_SESSION,
      },
    },
  });

  const out: AdminCalendarSession[] = [];

  for (const s of rows) {
    const series = s.classSeries;
    const timing = computeClassTiming({
      session: { startsAt: s.startsAt, endsAt: s.endsAt },
      series: {
        deliveryMode: series.deliveryMode as TimingMode,
        pickupAt: series.pickupAt,
      },
      school: series.school
        ? { coachArriveAtHubMinutes: series.school.coachArriveAtHubMinutes }
        : null,
    });

    const excludedCount = series.excludedDates?.length ?? 0;
    const summary = toSummary(series as SeriesForSummary, excludedCount);

    out.push({
      sessionId: s.id,
      classSeriesId: series.id,
      seriesName: series.name,
      programName: series.program.name,
      programTargetAudience: series.program.targetAudience,
      deliveryMode: series.deliveryMode as TimingMode,
      venueName: series.venue.name,
      clubId: series.venue.club?.id ?? null,
      clubName: series.venue.club?.name ?? null,
      schoolName: series.school?.name ?? null,
      dayOfWeek: series.dayOfWeek,
      leaveAt: timing.coachArriveAt ?? null,
      pickupAt: timing.pickupAt ?? null,
      classStartAt: timing.classStartAt,
      classEndAt: timing.classEndAt,
      summary,
    });
  }

  return out;
}

/** Class series rows for the admin list table. */
export async function listSeriesForAdmin(
  filters: AdminClassesFilters,
  kind: "class" | "event" | "camp" = "class",
) {
  const where = buildClassSeriesWhere(filters, kind);

  return prisma.classSeries.findMany({
    where,
    include: {
      program: { select: { name: true } },
      season: { select: { name: true } },
      venue: { select: { name: true, kind: true } },
      school: { select: { name: true } },
      coaches: {
        include: {
          coach: {
            select: {
              personId: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      _count: {
        select: { enrollments: { where: { status: "active" } }, sessions: true },
      },
    },
    orderBy: [{ startsOn: "desc" }, { name: "asc" }],
    take: 100,
  });
}

export async function countSessionsInCalendarRange(
  filters: AdminClassesFilters,
  rangeStart: Date,
  rangeEnd: Date,
  kind: "class" | "event" | "camp" = "class",
): Promise<number> {
  const seriesWhere = buildClassSeriesWhere(filters, kind);

  return prisma.classSession.count({
    where: {
      startsAt: { gte: rangeStart, lt: rangeEnd },
      cancelledAt: null,
      status: { not: "cancelled" },
      classSeries: seriesWhere,
    },
  });
}

/** Active clubs for filter dropdown. */
export async function listClubsForAdminFilter() {
  return prisma.club.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

/** Coaches for filter dropdown (excludes system placeholder). */
export async function listCoachesForAdminFilter() {
  const coachRows = await prisma.coach.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      personId: { not: SYSTEM_NO_COACH_PERSON_ID },
    },
    include: {
      person: { select: { firstName: true, lastName: true } },
    },
  });

  return coachRows
    .map((c) => ({
      personId: c.personId,
      name: [c.person.firstName, c.person.lastName].filter(Boolean).join(" "),
    }))
    .filter((c) => c.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Schools for youth → pickup cascade. */
export async function listSchoolsForAdminFilter() {
  return prisma.school.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}
