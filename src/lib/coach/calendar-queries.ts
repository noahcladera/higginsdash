import { prisma } from "@/lib/prisma";
import {
  classSeriesClubScope,
  courtBookingClubFilter,
} from "@/lib/coach/club-scope";
import { computeClassTiming } from "@/lib/classes/timing";
import type { ClassDeliveryMode } from "@/lib/classes/timing";

/**
 * One session's worth of data for the coach calendar, with timing anchors
 * already computed. The grid just positions these, no business logic
 * leaks into the component.
 *
 * For pickup classes all four anchors are populated:
 *
 *   leaveAt ──→ pickupAt ──→ classStartAt ──→ classEndAt
 *   (leave Triaz)  (kids out)     (class starts)    (class ends)
 *
 * For at-club / onsite classes only `classStartAt` / `classEndAt` are set
 * because the coach simply shows up at class start — paid hours begin
 * there.
 */
export type CoachCalendarSession = {
  sessionId: string;
  classSeriesId: string;
  seriesName: string;
  programName: string;
  role: "lead" | "assistant";
  deliveryMode: ClassDeliveryMode;
  venueName: string;
  schoolName: string | null;
  /** Pickup-mode only: coach leaves Triaz with the gocab. */
  leaveAt: Date | null;
  /** Pickup-mode only: kids out of school. */
  pickupAt: Date | null;
  classStartAt: Date;
  classEndAt: Date;
  /** Total minutes the block occupies on the grid (leaveAt→classEndAt for
   * pickup, classStartAt→classEndAt otherwise). */
  blockMinutes: number;
};

/**
 * A personal court booking (the coach booked a court for themselves or
 * with partners). Rendered as a plain single-strip block on the
 * calendar to visually separate it from teaching work.
 */
export type CoachCalendarBooking = {
  bookingId: string;
  courtName: string;
  clubName: string;
  startsAt: Date;
  endsAt: Date;
  blockMinutes: number;
};

/** Discriminated union the grid iterates over. */
export type CoachCalendarEvent =
  | ({ kind: "session" } & CoachCalendarSession)
  | ({ kind: "booking" } & CoachCalendarBooking);

/**
 * Fetch every non-cancelled session for a coach whose start falls inside
 * `[weekStart, weekStart + 7d)` plus their personal court bookings in
 * the same window. `weekStart` must be the Monday 00:00 Europe/Amsterdam
 * instant for the target week.
 *
 * Both lead and assistant teaching roles are included. Bookings only
 * include non-cancelled `confirmed` / `cancellation_requested` rows —
 * refused or withdrawn bookings don't belong on the coach's schedule.
 */
export async function getCoachCalendarEvents(
  coachPersonId: string,
  weekStart: Date,
  options?: { allowedClubIds?: string[] | null },
): Promise<CoachCalendarEvent[]> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const clubScope = classSeriesClubScope(options?.allowedClubIds ?? null);
  const bookingClubWhere = courtBookingClubFilter(
    options?.allowedClubIds ?? null,
  );

  const [sessions, bookings] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        startsAt: { gte: weekStart, lt: weekEnd },
        cancelledAt: null,
        status: { not: "cancelled" },
        // A coach lands on the calendar via two paths:
        //   1. They're on the series default lineup AND haven't been subbed
        //      out for this specific session.
        //   2. They've been added to this single session as a substitute
        //      (`class_session_coaches` row, possibly with isSubstitute=true).
        OR: [
          {
            classSeries: {
              coaches: { some: { coachPersonId } },
              ...clubScope,
            },
            // If anyone is substituting for this coach on this exact session,
            // skip it from their schedule — the sub shows up instead.
            coaches: {
              none: {
                isSubstitute: true,
                substitutingForPersonId: coachPersonId,
              },
            },
          },
          {
            classSeries: clubScope,
            coaches: { some: { coachPersonId } },
          },
        ],
      },
      orderBy: { startsAt: "asc" },
      include: {
        classSeries: {
          include: {
            program: { select: { name: true } },
            venue: { select: { name: true } },
            school: {
              select: {
                name: true,
                coachArriveAtHubMinutes: true,
              },
            },
            coaches: {
              where: { coachPersonId },
              select: {
                role: true,
                participatesInPickup: true,
                groupScopes: {
                  select: { group: { select: { endTime: true } } },
                },
              },
              take: 1,
            },
          },
        },
        coaches: {
          where: { coachPersonId },
          select: {
            role: true,
            isSubstitute: true,
            participatesInPickup: true,
            groupScopes: {
              select: { group: { select: { endTime: true } } },
            },
          },
          take: 1,
        },
      },
    }),
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: coachPersonId,
        startsAt: { gte: weekStart, lt: weekEnd },
        cancelledAt: null,
        status: { in: ["confirmed", "cancellation_requested"] },
        ...bookingClubWhere,
      },
      orderBy: { startsAt: "asc" },
      include: {
        court: { select: { name: true } },
        club: { select: { name: true } },
      },
    }),
  ]);

  const sessionEvents: CoachCalendarEvent[] = sessions.map((s) => {
    const series = s.classSeries;
    const seriesCoachRow = series.coaches[0];
    const sessionCoachRow = s.coaches[0];

    // Per-session row wins for `participatesInPickup` (so a sub or
    // an ad-hoc edit can override) but falls back to the series-level
    // default when the session has no override (NULL).
    const participatesInPickup =
      sessionCoachRow?.participatesInPickup ??
      seriesCoachRow?.participatesInPickup ??
      true;

    // Group scope is taken from the session-level row first; if no
    // session-level scope was set (none array), fall back to the
    // series-level scope. Empty list → "all groups" (full series end).
    const sessionScopes = sessionCoachRow?.groupScopes ?? [];
    const seriesScopes = seriesCoachRow?.groupScopes ?? [];
    const scopeRows = sessionScopes.length > 0 ? sessionScopes : seriesScopes;
    const groupEndTimes =
      scopeRows.length > 0
        ? scopeRows.map((sc) =>
            liftGroupEndOntoSession(s.startsAt, sc.group.endTime),
          )
        : undefined;

    const timing = computeClassTiming({
      session: { startsAt: s.startsAt, endsAt: s.endsAt },
      series: {
        deliveryMode: series.deliveryMode,
        pickupAt: series.pickupAt,
      },
      school: series.school
        ? { coachArriveAtHubMinutes: series.school.coachArriveAtHubMinutes }
        : null,
      coach: {
        participatesInPickup,
        groupEndTimes,
      },
    });

    const blockStart = timing.coachArriveAt ?? timing.classStartAt;
    const blockMinutes = Math.max(
      30,
      Math.round((timing.classEndAt.getTime() - blockStart.getTime()) / 60_000),
    );

    return {
      kind: "session",
      sessionId: s.id,
      classSeriesId: series.id,
      seriesName: series.name,
      programName: series.program.name,
      role: sessionCoachRow?.role ?? seriesCoachRow?.role ?? "lead",
      deliveryMode: series.deliveryMode,
      venueName: series.venue.name,
      schoolName: series.school?.name ?? null,
      leaveAt: timing.coachArriveAt ?? null,
      pickupAt: timing.pickupAt ?? null,
      classStartAt: timing.classStartAt,
      classEndAt: timing.classEndAt,
      blockMinutes,
    };
  });

  const bookingEvents: CoachCalendarEvent[] = bookings.map((b) => ({
    kind: "booking",
    bookingId: b.id,
    courtName: b.court.name,
    clubName: b.club.name,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    blockMinutes: Math.max(
      30,
      Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
    ),
  }));

  return [...sessionEvents, ...bookingEvents].sort(
    (a, b) => eventStart(a).getTime() - eventStart(b).getTime(),
  );
}

/**
 * Take the HH:MM portion of a `class_series_groups.end_time` value
 * (Prisma returns these anchored to 1970-01-01 UTC) and project it
 * onto the calendar day of `sessionStartsAt` in Europe/Amsterdam.
 *
 * Same approach as `liftTimeOntoDate` in timing.ts; kept here to keep
 * the dependency surface small and avoid leaking that internal helper.
 */
function liftGroupEndOntoSession(sessionStartsAt: Date, groupEnd: Date): Date {
  const hh = groupEnd.getUTCHours();
  const mm = groupEnd.getUTCMinutes();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(sessionStartsAt);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const mo = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  const approx = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  // Approximate Amsterdam UTC offset at the session's day.
  const offsetStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  })
    .formatToParts(approx)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(offsetStr ?? "");
  const offsetHours = match ? Number(match[1]) : 1;
  const offsetMins = match ? Number(match[2] ?? 0) : 0;
  const offset = offsetHours * 60 + (offsetHours < 0 ? -offsetMins : offsetMins);
  return new Date(approx.getTime() - offset * 60_000);
}

/** Block start-instant for sorting + day-bucketing the grid by. */
export function eventStart(event: CoachCalendarEvent): Date {
  if (event.kind === "session") {
    return event.leaveAt ?? event.classStartAt;
  }
  return event.startsAt;
}

/** Block end-instant (class end / booking end). */
export function eventEnd(event: CoachCalendarEvent): Date {
  return event.kind === "session" ? event.classEndAt : event.endsAt;
}
