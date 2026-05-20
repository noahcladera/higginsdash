/**
 * Turn admin calendar tap-selection keys into recurring-block patterns.
 *
 * Key format: `${courtId}|${dayDate}|${hour}` where hour is "HH:00".
 */

import type { DayOfWeek } from "@prisma/client";
import {
  amsterdamMidnightUtc,
  amsterdamDayOfWeek,
  parseLocalDate,
} from "@/lib/booking/time";

const DOW_TO_PRISMA: DayOfWeek[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export type BlockPattern = {
  courtId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  /** Earliest local date in the selection that contributes to this pattern. */
  firstDate: string;
};

function prismaDowForLocalDate(yyyymmdd: string): DayOfWeek {
  const { year, month, day } = parseLocalDate(yyyymmdd);
  const utc = amsterdamMidnightUtc(year, month, day);
  return DOW_TO_PRISMA[amsterdamDayOfWeek(utc)];
}

/** Add 1 hour to an "HH:MM" label, capping at "24:00". */
export function addOneHourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const next = Math.min(24, h + 1);
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hourToSortKey(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Groups selection keys into non-overlapping time segments per (court, weekday).
 */
export function groupSelectionToPatterns(
  selected: Set<string>,
): BlockPattern[] {
  type Entry = { courtId: string; date: string; hour: string };
  const entries: Entry[] = [];
  for (const key of selected) {
    const parts = key.split("|");
    if (parts.length !== 3) continue;
    const [courtId, date, hour] = parts;
    if (!courtId || !date || !hour) continue;
    entries.push({ courtId, date, hour });
  }

  const byCourtDow = new Map<string, Entry[]>();
  for (const e of entries) {
    const dow = prismaDowForLocalDate(e.date);
    const k = `${e.courtId}|${dow}`;
    const list = byCourtDow.get(k) ?? [];
    list.push(e);
    byCourtDow.set(k, list);
  }

  const patterns: BlockPattern[] = [];

  for (const [courtAndDow, list] of byCourtDow) {
    const [courtId, dayOfWeek] = courtAndDow.split("|") as [
      string,
      DayOfWeek,
    ];
    const hourSet = new Set(list.map((e) => e.hour));
    const sorted = [...hourSet].sort(
      (a, b) => hourToSortKey(a) - hourToSortKey(b),
    );

    const flushRun = (start: string, endHour: string) => {
      const contributing = list.filter(
        (e) =>
          hourToSortKey(e.hour) >= hourToSortKey(start) &&
          hourToSortKey(e.hour) <= hourToSortKey(endHour),
      );
      const firstDate = contributing
        .map((e) => e.date)
        .sort((a, b) => a.localeCompare(b))[0]!;
      patterns.push({
        courtId,
        dayOfWeek,
        startTime: start,
        endTime: addOneHourLabel(endHour),
        firstDate,
      });
    };

    let i = 0;
    while (i < sorted.length) {
      const runStart = sorted[i]!;
      let runEnd = sorted[i]!;
      let j = i + 1;
      while (
        j < sorted.length &&
        hourToSortKey(sorted[j]!) === hourToSortKey(runEnd) + 60
      ) {
        runEnd = sorted[j]!;
        j++;
      }
      flushRun(runStart, runEnd);
      i = j;
    }
  }

  patterns.sort((a, b) => {
    const c = a.courtId.localeCompare(b.courtId);
    if (c !== 0) return c;
    return a.startTime.localeCompare(b.startTime);
  });

  return patterns;
}
