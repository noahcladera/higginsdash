import { prisma } from "@/lib/prisma";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import type { ClassDeliveryMode } from "@/lib/classes/timing";

/**
 * A class series row enriched with everything the coach / admin "today"
 * and overview pages need: where it's played, pickup origin (if any),
 * next few sessions, and the enrolled headcount.
 */
export interface CoachClass {
  seriesId: string;
  seriesName: string;
  programName: string;
  deliveryMode: ClassDeliveryMode;
  /** Where the class is played. */
  venue: {
    id: string;
    name: string;
    kind: "club" | "school" | "rented_court";
  };
  /** Pickup-mode only: the school the coach collects kids from. */
  school: {
    id: string;
    name: string;
    coachArriveAtHubMinutes: number;
  } | null;
  /** Pickup mode only: local HH:MM pickup time (anchored to 1970 by Prisma). */
  pickupAt: Date | null;
  maxStudents: number;
  enrolledCount: number;
  sessions: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    courtName: string | null;
  }[];
}

/**
 * Get all class series where `coachPersonId` is on the default lineup,
 * with their upcoming sessions inside a forward window.
 *
 * `windowDays` defaults to 1 so the coach dashboard sees *today*. Pass
 * larger windows (e.g. 7) for "this week" views.
 */
export async function getCoachUpcomingClasses(
  coachPersonId: string,
  windowDays = 1,
  options?: { allowedClubIds?: string[] | null },
): Promise<CoachClass[]> {
  const now = new Date();
  const until = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);

  const series = await prisma.classSeries.findMany({
    where: {
      coaches: { some: { coachPersonId } },
      status: { in: ["published", "in_progress"] },
      ...clubScope,
      sessions: {
        some: {
          startsAt: { gte: dayStart(now), lt: until },
          status: { not: "cancelled" },
        },
      },
    },
    include: {
      program: { select: { name: true } },
      venue: true,
      school: {
        select: {
          id: true,
          name: true,
          coachArriveAtHubMinutes: true,
        },
      },
      _count: { select: { enrollments: { where: { status: "active" } } } },
      sessions: {
        where: {
          startsAt: { gte: dayStart(now), lt: until },
          status: { not: "cancelled" },
        },
        orderBy: { startsAt: "asc" },
        include: { court: { select: { name: true } } },
      },
    },
    orderBy: { startsOn: "asc" },
  });

  return series.map((s) => ({
    seriesId: s.id,
    seriesName: s.name,
    programName: s.program.name,
    deliveryMode: s.deliveryMode,
    venue: {
      id: s.venue.id,
      name: s.venue.name,
      kind: s.venue.kind,
    },
    school: s.school
      ? {
          id: s.school.id,
          name: s.school.name,
          coachArriveAtHubMinutes: s.school.coachArriveAtHubMinutes,
        }
      : null,
    pickupAt: s.pickupAt,
    maxStudents: s.maxStudents,
    enrolledCount: s._count.enrollments,
    sessions: s.sessions.map((x) => ({
      id: x.id,
      startsAt: x.startsAt,
      endsAt: x.endsAt,
      status: x.status,
      courtName: x.court?.name ?? null,
    })),
  }));
}

/**
 * Flatten `CoachClass[]` into one row per session, sorted by start
 * time. Handy for "Today's classes" lists.
 */
export function flattenCoachSessions(
  classes: CoachClass[],
): { series: CoachClass; session: CoachClass["sessions"][number] }[] {
  const out: { series: CoachClass; session: CoachClass["sessions"][number] }[] =
    [];
  for (const c of classes) {
    for (const s of c.sessions) out.push({ series: c, session: s });
  }
  out.sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
  return out;
}

function dayStart(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
