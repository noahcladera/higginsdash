import type { MedalLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MEDAL_LEVELS } from "@/lib/medal-levels";

export type TotalByCoachRow = {
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
};

function emptyMedalCounts(): Record<MedalLevel, number> {
  return Object.fromEntries(
    MEDAL_LEVELS.map((l) => [l.value, 0]),
  ) as Record<MedalLevel, number>;
}

export type TotalByCoachFilters = {
  seasonId?: string;
  clubId?: string;
  coachPersonId?: string;
};

/**
 * Replicate the workbook "Total By Coach" matrix: for each lead coach,
 * count active enrollments in published series where the student's
 * medal level matches each column.
 */
export async function getTotalByCoachReport(
  filters: TotalByCoachFilters = {},
): Promise<TotalByCoachRow[]> {
  const seriesWhere = {
    archivedAt: null,
    status: {
      in: ["published", "in_progress", "full"] as Array<
        "published" | "in_progress" | "full"
      >,
    },
    ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
    ...(filters.clubId ? { clubId: filters.clubId } : {}),
  };

  const coachLinks = await prisma.classSeriesCoach.findMany({
    where: {
      role: "lead",
      ...(filters.coachPersonId
        ? { coachPersonId: filters.coachPersonId }
        : {}),
      classSeries: seriesWhere,
      coach: { person: { archivedAt: null } },
    },
    select: {
      coachPersonId: true,
      classSeriesId: true,
      coach: {
        select: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
      classSeries: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: { status: { in: ["active", "waitlist"] } },
            select: {
              student: { select: { medalLevel: true } },
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

  const byCoach = new Map<
    string,
    {
      coachName: string;
      byMedal: Record<MedalLevel, number>;
      bySeries: Map<
        string,
        {
          seriesName: string;
          byMedal: Record<MedalLevel, number>;
        }
      >;
    }
  >();

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
        byMedal: emptyMedalCounts(),
        bySeries: new Map(),
      };
      byCoach.set(coachId, entry);
    }

    let seriesEntry = entry.bySeries.get(link.classSeriesId);
    if (!seriesEntry) {
      seriesEntry = {
        seriesName: link.classSeries.name,
        byMedal: emptyMedalCounts(),
      };
      entry.bySeries.set(link.classSeriesId, seriesEntry);
    }

    for (const enrollment of link.classSeries.enrollments) {
      const medal = enrollment.student.medalLevel;
      if (!medal) continue;
      entry.byMedal[medal] += 1;
      seriesEntry.byMedal[medal] += 1;
    }
  }

  return [...byCoach.entries()]
    .map(([coachId, data]) => {
      const bySeries = [...data.bySeries.entries()].map(
        ([seriesId, s]) => ({
          seriesId,
          seriesName: s.seriesName,
          byMedal: s.byMedal,
          total: Object.values(s.byMedal).reduce((a, b) => a + b, 0),
        }),
      );
      const grandTotal = Object.values(data.byMedal).reduce(
        (a, b) => a + b,
        0,
      );
      return {
        coachId,
        coachName: data.coachName,
        grandTotal,
        byMedal: data.byMedal,
        bySeries,
      };
    })
    .sort((a, b) => a.coachName.localeCompare(b.coachName));
}

export function totalByCoachToCsv(rows: TotalByCoachRow[]): string {
  const headers = [
    "Coach",
    "Programme",
    ...MEDAL_LEVELS.map((l) => l.shortCode),
    "Total",
  ];
  const lines = [headers.join(",")];

  for (const row of rows) {
    if (row.bySeries.length === 0) {
      lines.push(
        csvRow(row.coachName, "—", row.byMedal, row.grandTotal),
      );
      continue;
    }
    for (const series of row.bySeries) {
      lines.push(
        csvRow(row.coachName, series.seriesName, series.byMedal, series.total),
      );
    }
    lines.push(
      csvRow(`${row.coachName} (total)`, "", row.byMedal, row.grandTotal),
    );
  }
  return lines.join("\n");
}

function csvRow(
  coach: string,
  programme: string,
  byMedal: Record<MedalLevel, number>,
  total: number,
): string {
  const cells = [
    escapeCsv(coach),
    escapeCsv(programme),
    ...MEDAL_LEVELS.map((l) => String(byMedal[l.value])),
    String(total),
  ];
  return cells.join(",");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
