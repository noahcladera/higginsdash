import "server-only";

import { prisma } from "@/lib/prisma";
import {
  amsterdamMidnightUtc,
  parseLocalDate,
  addDays,
} from "@/lib/booking/time";
import {
  getCalendarWeek,
  type CalendarSlot,
  type CalendarWeek,
} from "@/lib/booking/queries";
import {
  classSessionToAdminCalendarRow,
  CLASS_SERIES_FOR_SESSION,
  type AdminCalendarSession,
} from "@/lib/admin/classes-queries";

export type AdminScheduleSection = CalendarWeek & {
  clubSlug: string;
};

export type AdminScheduleWeek = {
  weekStart: string;
  weekEnd: string;
  days: { date: string; weekday: string }[];
  sections: AdminScheduleSection[];
};

/** @deprecated Use AdminScheduleWeek */
export type AdminScheduleDay = AdminScheduleWeek;

function filterBookableCourts(week: CalendarWeek): CalendarWeek {
  return {
    ...week,
    courts: week.courts.filter((c) => c.isBookable),
  };
}

function filterSlots(
  week: CalendarWeek,
  showClasses: boolean,
  showBookings: boolean,
): CalendarWeek {
  if (showClasses && showBookings) return week;

  const courts = week.courts.map((court) => ({
    ...court,
    slots: court.slots.map((slot): CalendarSlot => {
      if (!showBookings && slot.state.kind === "booked") {
        return { ...slot, state: { kind: "free" } };
      }
      if (!showClasses && slot.state.kind === "class") {
        return { ...slot, state: { kind: "free" } };
      }
      return slot;
    }),
  }));

  return { ...week, courts };
}

export async function getAdminScheduleWeek(args: {
  weekStart: string;
  clubSlugs: ("triaz" | "randwijck")[];
  showClasses: boolean;
  showBookings: boolean;
}): Promise<AdminScheduleWeek> {
  if (args.clubSlugs.length === 0) {
    return {
      weekStart: args.weekStart,
      weekEnd: args.weekStart,
      days: [],
      sections: [],
    };
  }

  const clubs = await prisma.club.findMany({
    where: { slug: { in: args.clubSlugs }, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true },
  });

  const slugOrder = new Map<"triaz" | "randwijck", number>(
    args.clubSlugs.map((s, i) => [s, i]),
  );
  clubs.sort(
    (a, b) =>
      (slugOrder.get(a.slug as "triaz" | "randwijck") ?? 99) -
      (slugOrder.get(b.slug as "triaz" | "randwijck") ?? 99),
  );

  const sections = await Promise.all(
    clubs.map(async (club) => {
      const week = await getCalendarWeek({
        clubId: club.id,
        startDate: args.weekStart,
        days: 7,
        viewerRole: "admin",
      });
      return {
        ...filterSlots(
          filterBookableCourts(week),
          args.showClasses,
          args.showBookings,
        ),
        clubSlug: club.slug,
      };
    }),
  );

  const days = sections[0]?.days ?? [];

  return {
    weekStart: args.weekStart,
    weekEnd: days[days.length - 1]?.date ?? args.weekStart,
    days,
    sections,
  };
}

/** @deprecated Use getAdminScheduleWeek */
export async function getAdminScheduleDay(args: {
  date: string;
  clubSlugs: ("triaz" | "randwijck")[];
  showClasses: boolean;
  showBookings: boolean;
}): Promise<AdminScheduleWeek> {
  return getAdminScheduleWeek({ ...args, weekStart: args.date });
}

/** Sessions at club venues in the week with no court assigned at all. */
export async function countScheduleSessionsMissingCourt(args: {
  weekStart: string;
  clubSlugs: ("triaz" | "randwijck")[];
}): Promise<number> {
  if (args.clubSlugs.length === 0) return 0;

  const start = parseLocalDate(args.weekStart);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = addDays(startUtc, 7);

  return prisma.classSession.count({
    where: {
      startsAt: { gte: startUtc, lt: endUtc },
      status: { not: "cancelled" },
      courtId: null,
      classSeries: {
        defaultCourtId: null,
        classType: { notIn: ["event", "camp"] },
        venue: {
          kind: "club",
          club: { slug: { in: args.clubSlugs }, isActive: true },
        },
      },
    },
  });
}

/** Class sessions for the schedule classes-only calendar view. */
export async function listScheduleClassSessions(args: {
  weekStart: string;
  clubSlugs: ("triaz" | "randwijck")[];
}): Promise<AdminCalendarSession[]> {
  if (args.clubSlugs.length === 0) return [];

  const start = parseLocalDate(args.weekStart);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = addDays(startUtc, 7);

  const rows = await prisma.classSession.findMany({
    where: {
      startsAt: { gte: startUtc, lt: endUtc },
      cancelledAt: null,
      status: { not: "cancelled" },
      classSeries: {
        archivedAt: null,
        classType: { notIn: ["event", "camp"] },
        venue: {
          kind: "club",
          club: { slug: { in: args.clubSlugs }, isActive: true },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    include: {
      classSeries: {
        include: CLASS_SERIES_FOR_SESSION,
      },
    },
  });

  return rows.map(classSessionToAdminCalendarRow);
}

export function weekStartToDate(weekStart: string): Date {
  const parsed = parseLocalDate(weekStart);
  return amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);
}

export function weekDaysFromStart(weekStart: string): Date[] {
  const start = weekStartToDate(weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
