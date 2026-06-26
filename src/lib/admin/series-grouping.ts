import type { ClassRowData } from "@/app/admin/classes/_components/class-row";

const DAY_ORDER: ClassRowData["dayOfWeek"][] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

function dayIndex(dow: ClassRowData["dayOfWeek"]): number {
  const i = DAY_ORDER.indexOf(dow);
  return i >= 0 ? i : 0;
}

export function sortSeriesRows(rows: ClassRowData[]): ClassRowData[] {
  return [...rows].sort((a, b) => {
    const dayDiff = dayIndex(a.dayOfWeek) - dayIndex(b.dayOfWeek);
    if (dayDiff !== 0) return dayDiff;
    return a.startTimeHHMM.localeCompare(b.startTimeHHMM);
  });
}

export type SeriesSeasonGroup = {
  seasonId: string | null;
  seasonName: string;
  startsOnISO: string;
  rows: ClassRowData[];
};

export type SeriesProgramGroup = {
  programSlug: string;
  programName: string;
  seasons: SeriesSeasonGroup[];
  totalCount: number;
};

/** Group flat series rows into Program → Season hierarchy. */
export function groupSeriesByProgramSeason(
  rows: ClassRowData[],
): SeriesProgramGroup[] {
  const byProgram = new Map<string, ClassRowData[]>();
  for (const row of rows) {
    const key = row.programSlug;
    const list = byProgram.get(key);
    if (list) list.push(row);
    else byProgram.set(key, [row]);
  }

  const programs: SeriesProgramGroup[] = [];

  for (const [, programRows] of byProgram) {
    const programName = programRows[0]?.programName ?? "Unknown program";
    const programSlug = programRows[0]?.programSlug ?? "";

    const bySeason = new Map<string, ClassRowData[]>();
    for (const row of programRows) {
      const seasonKey = row.seasonId ?? "__none__";
      const list = bySeason.get(seasonKey);
      if (list) list.push(row);
      else bySeason.set(seasonKey, [row]);
    }

    const seasons: SeriesSeasonGroup[] = [];
    for (const [, seasonRows] of bySeason) {
      const sample = seasonRows[0]!;
      seasons.push({
        seasonId: sample.seasonId,
        seasonName: sample.seasonName ?? "No season label",
        startsOnISO: sample.startsOnISO,
        rows: sortSeriesRows(seasonRows),
      });
    }

    seasons.sort((a, b) => b.startsOnISO.localeCompare(a.startsOnISO));

    programs.push({
      programSlug,
      programName,
      seasons,
      totalCount: programRows.length,
    });
  }

  programs.sort((a, b) => a.programName.localeCompare(b.programName));
  return programs;
}
