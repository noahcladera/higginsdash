/**
 * Expand a `RecurringBlock`-shaped row into concrete UTC occurrences within
 * `[periodStart, periodEnd)`. Shared by admin invoicing and coach hours.
 */

import type { DayOfWeek } from "@prisma/client";
import {
  amsterdamMidnightUtc,
  amsterdamHourUtc,
  formatLocalDate,
  parseLocalDate,
  timeToHourMinute,
} from "@/lib/booking/time";

export function expandBlockOccurrences(
  block: {
    dayOfWeek: DayOfWeek | null;
    startTime: Date;
    endTime: Date;
    startsOn: Date;
    endsOn: Date;
    /** Local Amsterdam calendar dates (YYYY-MM-DD) to skip. */
    excludedDates?: Date[];
  },
  periodStart: Date,
  periodEnd: Date,
): { startsAt: Date; endsAt: Date }[] {
  const excludedSet = new Set(
    (block.excludedDates ?? []).map((d) => formatLocalDate(d)),
  );
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const { hour: sH, minute: sM } = timeToHourMinute(block.startTime);
  const { hour: eH, minute: eM } = timeToHourMinute(block.endTime);

  const dowMap: Record<DayOfWeek, number> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  } as Record<DayOfWeek, number>;
  const targetDow = block.dayOfWeek ? dowMap[block.dayOfWeek] : null;

  const cursor = new Date(
    Math.max(
      periodStart.getTime(),
      amsterdamMidnightUtc(
        block.startsOn.getUTCFullYear(),
        block.startsOn.getUTCMonth() + 1,
        block.startsOn.getUTCDate(),
      ).getTime(),
    ),
  );
  const stop = new Date(
    Math.min(
      periodEnd.getTime(),
      amsterdamMidnightUtc(
        block.endsOn.getUTCFullYear(),
        block.endsOn.getUTCMonth() + 1,
        block.endsOn.getUTCDate(),
      ).getTime() +
        24 * 60 * 60_000,
    ),
  );

  while (cursor < stop) {
    const iso = formatLocalDate(cursor);
    if (excludedSet.has(iso)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }
    const { year, month, day } = parseLocalDate(iso);
    const weekdayShort = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Amsterdam",
      weekday: "short",
    }).format(cursor);
    const weekdayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const dow = weekdayMap[weekdayShort] ?? 0;

    if (targetDow === null || dow === targetDow) {
      const startsAt = amsterdamHourUtc(year, month, day, sH, sM);
      const endsAt = amsterdamHourUtc(year, month, day, eH, eM);
      if (startsAt >= periodStart && startsAt < periodEnd) {
        out.push({ startsAt, endsAt });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}
