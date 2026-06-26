import type { MedalLevel } from "@prisma/client";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import {
  coachMedalsReportToTotalByCoach,
  getCoachMedalsReport,
  type CoachMedalsReportFilters,
} from "./coach-medals-report";

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

export type TotalByCoachFilters = CoachMedalsReportFilters;

/**
 * Replicate the workbook "Total By Coach" matrix: for each lead coach,
 * count active enrollments in published series where the student's
 * medal level matches each column.
 */
export async function getTotalByCoachReport(
  filters: TotalByCoachFilters = {},
): Promise<TotalByCoachRow[]> {
  const rows = await getCoachMedalsReport(filters);
  return coachMedalsReportToTotalByCoach(rows);
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
