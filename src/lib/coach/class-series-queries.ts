import type { Prisma } from "@prisma/client";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { prisma } from "@/lib/prisma";

const ACTIVE_ENROLLMENT = {
  status: { in: ["active", "waitlist"] as ("active" | "waitlist")[] },
};

const coachSeriesRosterInclude = {
  program: { select: { name: true, targetAudience: true } },
  venue: { select: { name: true } },
  enrollments: {
    where: ACTIVE_ENROLLMENT,
    orderBy: { enrolledOn: "asc" as const },
    include: {
      student: {
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClassSeriesInclude;

const coachSessionInclude = {
  court: { select: { name: true } },
  classSeries: {
    include: {
      program: { select: { name: true, targetAudience: true } },
      venue: { select: { id: true, name: true, kind: true } },
      school: {
        select: {
          id: true,
          name: true,
          coachArriveAtHubMinutes: true,
        },
      },
      enrollments: {
        where: ACTIVE_ENROLLMENT,
        orderBy: { enrolledOn: "asc" as const },
        include: {
          student: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClassSessionInclude;

export type CoachSessionWithRoster = Prisma.ClassSessionGetPayload<{
  include: typeof coachSessionInclude;
}>;

export type CoachSeriesWithRoster = Prisma.ClassSeriesGetPayload<{
  include: typeof coachSeriesRosterInclude;
}>;

export type CoachSeriesListRow = {
  id: string;
  name: string;
  status: string;
  programName: string;
  targetAudience: string;
  minAge: number | null;
  maxAge: number | null;
  startsOn: Date;
  endsOn: Date;
  enrolledCount: number;
};

/**
 * All class series this coach is assigned to (non-archived), with active
 * enrollment counts.
 */
export async function getCoachClassSeriesList(
  coachPersonId: string,
  options?: { allowedClubIds?: string[] | null },
): Promise<CoachSeriesListRow[]> {
  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);
  const rows = await prisma.classSeries.findMany({
    where: {
      archivedAt: null,
      coaches: { some: { coachPersonId } },
      status: { in: ["published", "in_progress", "full", "draft"] },
      ...clubScope,
    },
    include: {
      program: { select: { name: true, targetAudience: true } },
      _count: {
        select: { enrollments: { where: ACTIVE_ENROLLMENT } },
      },
    },
    orderBy: [{ startsOn: "desc" }, { name: "asc" }],
  });

  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    programName: s.program.name,
    targetAudience: s.program.targetAudience,
    minAge: s.minAge,
    maxAge: s.maxAge,
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    enrolledCount: s._count.enrollments,
  }));
}

/**
 * One series the coach teaches, with roster (active + waitlist enrollments).
 */
export async function getCoachSeriesWithRoster(
  coachPersonId: string,
  seriesId: string,
  options?: { allowedClubIds?: string[] | null },
): Promise<CoachSeriesWithRoster | null> {
  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);
  return prisma.classSeries.findFirst({
    where: {
      id: seriesId,
      archivedAt: null,
      coaches: { some: { coachPersonId } },
      ...clubScope,
    },
    include: coachSeriesRosterInclude,
  });
}

/**
 * One specific session of a series the coach teaches, with the same
 * roster shape `getCoachSeriesWithRoster` returns. Returns `null` when
 * the coach isn't on the series, the session belongs to a different
 * series, or it lives in a club the coach can't see.
 */
export async function getCoachSessionWithRoster(
  coachPersonId: string,
  seriesId: string,
  sessionId: string,
  options?: { allowedClubIds?: string[] | null },
): Promise<CoachSessionWithRoster | null> {
  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);
  return prisma.classSession.findFirst({
    where: {
      id: sessionId,
      classSeriesId: seriesId,
      classSeries: {
        archivedAt: null,
        ...clubScope,
      },
      // Series-default coach OR session-level substitute. The substitute
      // wouldn't otherwise be on the series lineup but still needs to load
      // the roster page.
      OR: [
        { classSeries: { coaches: { some: { coachPersonId } } } },
        { coaches: { some: { coachPersonId } } },
      ],
    },
    include: coachSessionInclude,
  });
}

/**
 * Load household adults for a student (for coach-safe contact context).
 */
export async function getStudentHouseholdAdults(studentPersonId: string) {
  const member = await prisma.householdMember.findUnique({
    where: { personId: studentPersonId },
    include: {
      household: {
        include: {
          members: {
            where: { roleInHousehold: "adult" },
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  emails: {
                    where: { archivedAt: null },
                    orderBy: { isPrimary: "desc" },
                    take: 3,
                    select: { address: true, isPrimary: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!member) return { householdName: null as string | null, adults: [] };

  const adults = member.household.members.map((m) => ({
    personId: m.person.id,
    firstName: m.person.firstName,
    lastName: m.person.lastName,
    phone: m.person.phone,
    emails: m.person.emails,
  }));

  return {
    householdName: member.household.displayName,
    adults,
  };
}

/**
 * Other series this coach teaches where the same student is enrolled.
 */
export async function getCoachOtherSeriesForStudent(
  coachPersonId: string,
  studentPersonId: string,
  excludeSeriesId: string,
  options?: { allowedClubIds?: string[] | null },
) {
  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);
  return prisma.classSeries.findMany({
    where: {
      id: { not: excludeSeriesId },
      archivedAt: null,
      coaches: { some: { coachPersonId } },
      ...clubScope,
      enrollments: {
        some: {
          studentPersonId,
          status: { in: ["active", "waitlist"] },
        },
      },
    },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}
