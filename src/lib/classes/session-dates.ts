/**
 * Pure helpers for expanding a weekly-recurring `ClassSeries` into the
 * concrete `ClassSession` instants that go in the DB.
 *
 * Lives outside `app/admin/classes/actions.ts` so seed scripts (and
 * any future migration tooling) can use the same canonical generator
 * without having to import a `"use server"` module.
 *
 * Inputs are all stored in the same shapes Prisma uses:
 *   - `startsOn` / `endsOn` are calendar dates (`@db.Date`, anchored
 *     at UTC midnight).
 *   - `startTime` / `endTime` are time-of-day (`@db.Time(6)`, anchored
 *     1970-01-01 UTC, only HH:MM matters).
 *   - Excluded dates are passed as `Set<string>` of `YYYY-MM-DD` keys
 *     to make the lookup O(1).
 *
 * Output: array of `{ startsAt, endsAt }` absolute UTC instants for
 * each occurrence, accounting for the Europe/Amsterdam DST offset on
 * the day in question.
 */

export type DayOfWeekKey =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

const DAY_INDEX: Record<DayOfWeekKey, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 0,
};

export interface GenerateSessionDatesArgs {
  startsOn: Date;
  endsOn: Date;
  dayOfWeek: DayOfWeekKey;
  startTime: Date;
  endTime: Date;
  /** YYYY-MM-DD UTC date keys that should be skipped (e.g. holidays). */
  excluded: Set<string>;
}

/**
 * Walk every calendar day between `startsOn` and `endsOn` (inclusive),
 * keep the ones that fall on the target weekday, drop the excluded
 * dates, and emit `{ startsAt, endsAt }` UTC instants at the stored
 * HH:MM in Europe/Amsterdam.
 */
export function generateSessionDates(
  args: GenerateSessionDatesArgs,
): { startsAt: Date; endsAt: Date }[] {
  const target = DAY_INDEX[args.dayOfWeek];
  const out: { startsAt: Date; endsAt: Date }[] = [];
  const cursor = new Date(args.startsOn);
  const end = new Date(args.endsOn);
  while (cursor <= end) {
    if (cursor.getUTCDay() === target) {
      const key = toDateKey(cursor);
      if (!args.excluded.has(key)) {
        out.push({
          startsAt: combineDateAndTime(cursor, args.startTime),
          endsAt: combineDateAndTime(cursor, args.endTime),
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * `YYYY-MM-DD` from a UTC-anchored Date. Stable sort key + safe map
 * key for date comparisons.
 */
export function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function combineDateAndTime(date: Date, time: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const hh = time.getUTCHours();
  const mm = time.getUTCMinutes();
  // Build the UTC instant at hh:mm Amsterdam local time on that day.
  const approx = new Date(Date.UTC(y, m, d, hh, mm));
  const offsetMinutes = amsterdamOffsetMinutes(approx);
  return new Date(approx.getTime() - offsetMinutes * 60_000);
}

function amsterdamOffsetMinutes(at: Date): number {
  const str = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  if (!str) return 60;
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(str);
  if (!match) return 60;
  const hours = Number(match[1]);
  const mins = Number(match[2] ?? 0);
  return hours * 60 + (hours < 0 ? -mins : mins);
}
