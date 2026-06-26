/**
 * Booking time utilities. All timestamps in the database are timestamptz
 * stored in UTC; the user-facing club hours (e.g. opens 09:00) are in
 * Europe/Amsterdam local time per the design doc R-cross-cutting rule.
 *
 * These helpers convert "local Amsterdam YYYY-MM-DD HH:00" into the
 * correct UTC moment, with DST handled correctly by Intl.
 */

export const CLUB_TZ = "Europe/Amsterdam";

/** Shared week-calendar time axis (Europe/Amsterdam local hours). */
export const CALENDAR_AXIS_START_HOUR = 9;
export const CALENDAR_AXIS_END_HOUR = 22;

/**
 * Returns the UTC offset in minutes for Europe/Amsterdam at the given UTC
 * moment. CET = +60, CEST = +120.
 */
export function amsterdamOffsetMinutes(utcMoment: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TZ,
    timeZoneName: "longOffset",
    year: "numeric",
  });
  const tz =
    fmt.formatToParts(utcMoment).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT+01:00";
  const m = tz.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 60;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/** UTC Date that corresponds to 00:00 Europe/Amsterdam on the given local date. */
export function amsterdamMidnightUtc(
  year: number,
  month: number, // 1-12
  day: number,
): Date {
  // Use 12:00 UTC as the probe — far enough from DST transitions to be safe.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offset = amsterdamOffsetMinutes(probe);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset * 60_000);
}

/** UTC Date for `hour:00` local Amsterdam on the given local date. */
export function amsterdamHourUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number = 0,
): Date {
  const midnight = amsterdamMidnightUtc(year, month, day);
  return new Date(midnight.getTime() + (hour * 60 + minute) * 60_000);
}

/** Parse 'YYYY-MM-DD' into local components. Throws on bad input. */
export function parseLocalDate(yyyymmdd: string): {
  year: number;
  month: number;
  day: number;
} {
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid date '${yyyymmdd}', expected YYYY-MM-DD`);
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  };
}

/** Format a Date as 'YYYY-MM-DD' in Europe/Amsterdam. */
export function formatLocalDate(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

/** Format a Date as 'HH:00' in Europe/Amsterdam. */
export function formatLocalHour(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-NL", {
    timeZone: CLUB_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

/**
 * The local Amsterdam day-of-week index where Monday = 0 ... Sunday = 6.
 * Matches the DayOfWeek enum's mon/tue/wed/thu/fri/sat/sun ordering.
 */
export function amsterdamDayOfWeek(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TZ,
    weekday: "short",
  });
  const w = fmt.format(d);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[w] ?? 0;
}

/** Add `n` days (24*60min * n) to a date. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60_000);
}

/**
 * Map a Postgres `time` value (a Date pinned to 1970-01-01T HH:MM:SS UTC by
 * Prisma) to {hour, minute} for use against local Amsterdam slots. The
 * `booking_settings.opens_at_local_time` column stores HH:MM:SS as a TIME
 * (no timezone), and Prisma surfaces it as a Date with that time as UTC.
 */
export function timeToHourMinute(t: Date): { hour: number; minute: number } {
  return { hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

/** Minutes since midnight for a local {hour, minute} pair. */
export function localMinutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/** Visual grid row height in minutes (matches `buildBookingTimeSlots` step). */
export function bookingGridStepMinutes(
  startTimeConstraint: "any" | "on_the_hour" | "on_the_half_hour",
): number {
  return startTimeConstraint === "on_the_half_hour" ? 30 : 60;
}

/**
 * Calendar row starts for a club day: each entry is a bookable start time
 * where `start + bookingDurationMinutes <= closes`.
 */
export function buildBookingTimeSlots(args: {
  opensAtLocalTime: Date;
  closesAtLocalTime: Date;
  startTimeConstraint: "any" | "on_the_hour" | "on_the_half_hour";
  bookingDurationMinutes: number;
}): { hour: number; minute: number }[] {
  const opens = timeToHourMinute(args.opensAtLocalTime);
  const closes = timeToHourMinute(args.closesAtLocalTime);
  const opensMin = localMinutesSinceMidnight(opens.hour, opens.minute);
  const closesMin = localMinutesSinceMidnight(closes.hour, closes.minute);
  const stepMinutes = bookingGridStepMinutes(args.startTimeConstraint);
  const duration = args.bookingDurationMinutes;

  const slots: { hour: number; minute: number }[] = [];
  for (
    let t = opensMin;
    t + duration <= closesMin;
    t += stepMinutes
  ) {
    if (args.startTimeConstraint === "on_the_hour" && t % 60 !== 0) {
      continue;
    }
    slots.push({
      hour: Math.floor(t / 60),
      minute: t % 60,
    });
  }
  return slots;
}

/** Compare two "HH:MM" labels (same-day local times). */
export function compareLocalTimeLabels(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return localMinutesSinceMidnight(ah, am) - localMinutesSinceMidnight(bh, bm);
}
