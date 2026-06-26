import type { MedalLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import { studentMedalEligible } from "@/lib/medals/coach-roster";

export type StudentAssignmentGap = {
  studentPersonId: string;
  studentName: string;
  seriesId: string;
  seriesName: string;
};

export type CoachMedalsSeriesRow = {
  seriesId: string;
  seriesName: string;
  byMedal: Record<MedalLevel, number>;
  total: number;
  enrolledCount: number;
};

export type CoachMedalsReportRow = {
  coachId: string;
  coachName: string;
  coachPhone: string | null;
  seriesCount: number;
  enrolledCount: number;
  assignedCount: number;
  byMedal: Record<MedalLevel, number>;
  bySeries: CoachMedalsSeriesRow[];
  missingMedals: StudentAssignmentGap[];
  missingLevels: StudentAssignmentGap[];
};

export type CoachMedalsReportFilters = {
  seasonId?: string;
  clubId?: string;
  coachPersonId?: string;
};

function emptyMedalCounts(): Record<MedalLevel, number> {
  return Object.fromEntries(
    MEDAL_LEVELS.map((l) => [l.value, 0]),
  ) as Record<MedalLevel, number>;
}

function studentDisplayName(person: {
  firstName: string;
  lastName: string;
}): string {
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    "Unnamed"
  );
}

function publishedSeriesWhere(filters: CoachMedalsReportFilters = {}) {
  return {
    archivedAt: null,
    status: {
      in: ["published", "in_progress", "full"] as Array<
        "published" | "in_progress" | "full"
      >,
    },
    ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
    ...(filters.clubId ? { clubId: filters.clubId } : {}),
  };
}

type CoachLinkRow = Awaited<
  ReturnType<typeof fetchCoachSeriesLinks>
>[number];

async function fetchCoachSeriesLinks(filters: CoachMedalsReportFilters) {
  return prisma.classSeriesCoach.findMany({
    where: {
      role: "lead",
      ...(filters.coachPersonId
        ? { coachPersonId: filters.coachPersonId }
        : {}),
      classSeries: publishedSeriesWhere(filters),
      coach: { person: { archivedAt: null } },
    },
    select: {
      coachPersonId: true,
      classSeriesId: true,
      coach: {
        select: {
          person: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      },
      classSeries: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: { status: { in: ["active", "waitlist"] } },
            select: {
              studentPersonId: true,
              student: {
                select: {
                  medalLevel: true,
                  skillLevel: true,
                  person: {
                    select: {
                      firstName: true,
                      lastName: true,
                      dateOfBirth: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [
      { coach: { person: { lastName: "asc" } } },
      { coach: { person: { firstName: "asc" } } },
      { classSeries: { name: "asc" } },
    ],
  });
}

async function loadHouseholdRoles(
  studentPersonIds: string[],
): Promise<Map<string, string | null>> {
  if (studentPersonIds.length === 0) return new Map();
  const members = await prisma.householdMember.findMany({
    where: { personId: { in: studentPersonIds } },
    select: { personId: true, roleInHousehold: true },
  });
  return new Map(members.map((m) => [m.personId, m.roleInHousehold]));
}

type CoachAccumulator = {
  coachName: string;
  coachPhone: string | null;
  byMedal: Record<MedalLevel, number>;
  enrolledCount: number;
  assignedCount: number;
  bySeries: Map<
    string,
    {
      seriesName: string;
      byMedal: Record<MedalLevel, number>;
      enrolledCount: number;
    }
  >;
  missingMedals: StudentAssignmentGap[];
  missingLevels: StudentAssignmentGap[];
};

function processCoachLinks(
  coachLinks: CoachLinkRow[],
  roleByStudent: Map<string, string | null>,
): CoachMedalsReportRow[] {
  const byCoach = new Map<string, CoachAccumulator>();

  for (const link of coachLinks) {
    const coachId = link.coachPersonId;
    const coachName =
      [link.coach.person.firstName, link.coach.person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unnamed coach";

    let entry = byCoach.get(coachId);
    if (!entry) {
      entry = {
        coachName,
        coachPhone: link.coach.person.phone,
        byMedal: emptyMedalCounts(),
        enrolledCount: 0,
        assignedCount: 0,
        bySeries: new Map(),
        missingMedals: [],
        missingLevels: [],
      };
      byCoach.set(coachId, entry);
    }

    let seriesEntry = entry.bySeries.get(link.classSeriesId);
    if (!seriesEntry) {
      seriesEntry = {
        seriesName: link.classSeries.name,
        byMedal: emptyMedalCounts(),
        enrolledCount: 0,
      };
      entry.bySeries.set(link.classSeriesId, seriesEntry);
    }

    for (const enrollment of link.classSeries.enrollments) {
      entry.enrolledCount += 1;
      seriesEntry.enrolledCount += 1;

      const person = enrollment.student.person;
      const medalEligible = studentMedalEligible(
        person,
        roleByStudent.get(enrollment.studentPersonId),
      );
      const studentName = studentDisplayName(person);

      if (medalEligible) {
        const medal = enrollment.student.medalLevel;
        if (medal) {
          entry.byMedal[medal] += 1;
          seriesEntry.byMedal[medal] += 1;
          entry.assignedCount += 1;
        } else {
          entry.missingMedals.push({
            studentPersonId: enrollment.studentPersonId,
            studentName,
            seriesId: link.classSeriesId,
            seriesName: link.classSeries.name,
          });
        }
      } else if (enrollment.student.skillLevel == null) {
        entry.missingLevels.push({
          studentPersonId: enrollment.studentPersonId,
          studentName,
          seriesId: link.classSeriesId,
          seriesName: link.classSeries.name,
        });
      }
    }
  }

  return [...byCoach.entries()]
    .map(([coachId, data]) => {
      const bySeries = [...data.bySeries.entries()].map(
        ([seriesId, s]): CoachMedalsSeriesRow => ({
          seriesId,
          seriesName: s.seriesName,
          byMedal: s.byMedal,
          total: Object.values(s.byMedal).reduce((a, b) => a + b, 0),
          enrolledCount: s.enrolledCount,
        }),
      );

      return {
        coachId,
        coachName: data.coachName,
        coachPhone: data.coachPhone,
        seriesCount: bySeries.length,
        enrolledCount: data.enrolledCount,
        assignedCount: data.assignedCount,
        byMedal: data.byMedal,
        bySeries,
        missingMedals: data.missingMedals,
        missingLevels: data.missingLevels,
      };
    })
    .sort((a, b) => a.coachName.localeCompare(b.coachName));
}

export async function getCoachMedalsReport(
  filters: CoachMedalsReportFilters = {},
): Promise<CoachMedalsReportRow[]> {
  const coachLinks = await fetchCoachSeriesLinks(filters);
  const studentIds = [
    ...new Set(
      coachLinks.flatMap((link) =>
        link.classSeries.enrollments.map((e) => e.studentPersonId),
      ),
    ),
  ];
  const roleByStudent = await loadHouseholdRoles(studentIds);
  return processCoachLinks(coachLinks, roleByStudent);
}

/** Gaps for reminders — always all published series for one coach (no page filters). */
export async function getCoachAssignmentGaps(coachPersonId: string): Promise<{
  coachName: string;
  coachPhone: string | null;
  missingMedals: StudentAssignmentGap[];
  missingLevels: StudentAssignmentGap[];
}> {
  const coachLinks = await fetchCoachSeriesLinks({ coachPersonId });
  const studentIds = [
    ...new Set(
      coachLinks.flatMap((link) =>
        link.classSeries.enrollments.map((e) => e.studentPersonId),
      ),
    ),
  ];
  const roleByStudent = await loadHouseholdRoles(studentIds);
  const rows = processCoachLinks(coachLinks, roleByStudent);
  const row = rows[0];

  if (!row) {
    const coach = await prisma.coach.findUnique({
      where: { personId: coachPersonId },
      select: {
        person: {
          select: { firstName: true, lastName: true, phone: true },
        },
      },
    });
    return {
      coachName: coach
        ? studentDisplayName(coach.person)
        : "Coach",
      coachPhone: coach?.person.phone ?? null,
      missingMedals: [],
      missingLevels: [],
    };
  }

  return {
    coachName: row.coachName,
    coachPhone: row.coachPhone,
    missingMedals: row.missingMedals,
    missingLevels: row.missingLevels,
  };
}

/** Map enriched report rows to legacy CSV/matrix shape. */
export function coachMedalsReportToTotalByCoach(
  rows: CoachMedalsReportRow[],
): Array<{
  coachId: string;
  coachName: string;
  grandTotal: number;
  byMedal: Record<MedalLevel, number>;
  bySeries: Array<{
    seriesId: string;
    seriesName: string;
    byMedal: Record<MedalLevel, number>;
    total: number;
  }>;
}> {
  return rows.map((row) => ({
    coachId: row.coachId,
    coachName: row.coachName,
    grandTotal: row.assignedCount,
    byMedal: row.byMedal,
    bySeries: row.bySeries.map((s) => ({
      seriesId: s.seriesId,
      seriesName: s.seriesName,
      byMedal: s.byMedal,
      total: s.total,
    })),
  }));
}
