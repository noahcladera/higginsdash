/**
 * Helpers for event series where each calendar date is sold separately
 * (e.g. weekly Vrijmibo — enroll for the next Friday only).
 */

export type SessionLike = {
  startsAt: Date;
  status?: string;
};

export type EventOccurrence = {
  /** Calendar date (UTC date part of startsAt). */
  occurrenceDate: Date;
  startsAt: Date;
};

/** Events may have one session row per court on the same date. */
export function dedupeSessionsByOccurrenceDate<T extends SessionLike>(
  sessions: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const key = session.startsAt.toISOString().slice(0, 10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(session);
  }
  return out.sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compare calendar dates (ignores time-of-day). */
export function sameOccurrenceDate(a: Date, b: Date): boolean {
  return toUtcDateKey(a) === toUtcDateKey(b);
}

/** First future non-cancelled occurrence after dedupe, or null if none. */
export function getNextEventOccurrence(
  sessions: SessionLike[],
  now: Date,
): EventOccurrence | null {
  const deduped = dedupeSessionsByOccurrenceDate(sessions);
  const next = deduped.find((s) => s.startsAt.getTime() > now.getTime());
  if (!next) return null;
  const occurrenceDate = new Date(toUtcDateKey(next.startsAt) + "T00:00:00.000Z");
  return { occurrenceDate, startsAt: next.startsAt };
}

/** Human-readable date for portal copy (e.g. "Fri 4 Jul"). */
export function formatOccurrenceDate(
  date: Date,
  locale = "en-GB",
): string {
  return date.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Date + time for enroll panel (e.g. "Fri 4 Jul · 17:00"). */
export function formatOccurrenceDateTime(
  startsAt: Date,
  locale = "en-GB",
): string {
  const datePart = startsAt.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timePart = startsAt.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} · ${timePart}`;
}

/** True when enrollment blocks signup for the given next occurrence. */
export function enrollmentBlocksNextEventOccurrence(args: {
  status: string;
  eventOccurrenceDate: Date | null;
  nextOccurrenceDate: Date;
  now: Date;
}): boolean {
  const { status, eventOccurrenceDate, nextOccurrenceDate, now } = args;
  if (status === "withdrawn" || status === "completed") return false;

  if (
    eventOccurrenceDate != null &&
    eventOccurrenceDate.getTime() < startOfUtcDay(now).getTime() &&
    (status === "active" || status === "pending_payment")
  ) {
    return false;
  }

  if (
    status === "active" ||
    status === "pending_payment" ||
    status === "waitlist"
  ) {
    if (eventOccurrenceDate == null) return true;
    return sameOccurrenceDate(eventOccurrenceDate, nextOccurrenceDate);
  }

  return false;
}

function startOfUtcDay(d: Date): Date {
  return new Date(toUtcDateKey(d) + "T00:00:00.000Z");
}

export type EnrollmentSessionScope = {
  classSeriesId: string;
  classType: string;
  eventOccurrenceDate: Date | null;
};

/** UTC day bounds `[gte, lt)` for sessions on a single event occurrence. */
export function occurrenceDayBounds(occurrenceDate: Date): {
  gte: Date;
  lt: Date;
} {
  const gte = occurrenceDate;
  const lt = new Date(occurrenceDate);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/**
 * Per-enrollment session windows for DB queries. Events scope to one
 * calendar date; regular series include all future sessions.
 */
export function sessionWindowsForEnrollments(
  enrollments: EnrollmentSessionScope[],
  now: Date,
): Array<{ classSeriesId: string; startsAtGte: Date; startsAtLt?: Date }> {
  const nonEventSeriesIds = new Set<string>();
  const eventWindows = new Map<
    string,
    { classSeriesId: string; startsAtGte: Date; startsAtLt: Date }
  >();
  const legacyEventSeriesIds = new Set<string>();

  for (const e of enrollments) {
    if (e.classType === "event") {
      if (e.eventOccurrenceDate != null) {
        const key = `${e.classSeriesId}::${toUtcDateKey(e.eventOccurrenceDate)}`;
        if (!eventWindows.has(key)) {
          const { gte, lt } = occurrenceDayBounds(e.eventOccurrenceDate);
          eventWindows.set(key, {
            classSeriesId: e.classSeriesId,
            startsAtGte: gte,
            startsAtLt: lt,
          });
        }
      } else {
        legacyEventSeriesIds.add(e.classSeriesId);
      }
    } else {
      nonEventSeriesIds.add(e.classSeriesId);
    }
  }

  const out: Array<{
    classSeriesId: string;
    startsAtGte: Date;
    startsAtLt?: Date;
  }> = [];

  for (const id of nonEventSeriesIds) {
    out.push({ classSeriesId: id, startsAtGte: now });
  }
  for (const window of eventWindows.values()) {
    out.push(window);
  }
  for (const id of legacyEventSeriesIds) {
    out.push({ classSeriesId: id, startsAtGte: now });
  }

  return out;
}

/** True when a session row should appear for this enrollment. */
export function sessionMatchesEnrollmentScope(
  sessionStartsAt: Date,
  enrollment: EnrollmentSessionScope,
): boolean {
  if (enrollment.classType !== "event") return true;
  if (enrollment.eventOccurrenceDate == null) return true;
  return sameOccurrenceDate(sessionStartsAt, enrollment.eventOccurrenceDate);
}

/** One row per student per event date (multi-court events share a date). */
export function eventSessionDedupeKey(
  studentPersonId: string,
  classSeriesId: string,
  sessionStartsAt: Date,
): string {
  return `${studentPersonId}::${classSeriesId}::${toUtcDateKey(sessionStartsAt)}`;
}
