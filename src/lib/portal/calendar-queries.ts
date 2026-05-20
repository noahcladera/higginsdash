import { prisma } from "@/lib/prisma";
import { computeClassTiming } from "@/lib/classes/timing";
import type { ClassDeliveryMode } from "@/lib/classes/timing";

/**
 * Member-facing calendar event. One discriminated union so the grid can
 * iterate without branching on shape.
 *
 * Sessions carry a `colorIndex` so the component can paint each child's
 * lessons in a distinct tone. `ownerPersonId` / `ownerFirstName` identify
 * which student the session belongs to (useful for tooltips, legends, and
 * click-through navigation later).
 *
 * Bookings are household-level and always neutral grey — we don't color
 * by person because a household booking doesn't belong to any single
 * child.
 */
export type MemberCalendarEvent =
  | {
      kind: "session";
      id: string;
      seriesName: string;
      programName: string;
      deliveryMode: ClassDeliveryMode;
      venueName: string;
      schoolName: string | null;
      /**
       * Coach-only logistics anchor (when the coach leaves Triaz with the
       * gocab). Always `null` on the member calendar — parents shouldn't
       * see the coach's drive time. Kept on the type so future surfaces
       * that want to populate it don't have to widen the union.
       */
      leaveAt: Date | null;
      /** Pickup-mode only: kids out of school. */
      pickupAt: Date | null;
      classStartAt: Date;
      classEndAt: Date;
      blockStart: Date;
      blockMinutes: number;
      ownerPersonId: string;
      ownerFirstName: string;
      colorIndex: number;
    }
  | {
      kind: "booking";
      id: string;
      courtName: string;
      clubName: string;
      startsAt: Date;
      endsAt: Date;
      blockStart: Date;
      blockMinutes: number;
      /** Person who made the booking — may be any household adult. */
      ownerPersonId: string;
      ownerFirstName: string;
    };

/** Entry in `studentIdsToShow` — used to tag sessions with a color. */
export interface MemberCalendarStudent {
  personId: string;
  firstName: string;
  colorIndex: number;
}

/**
 * Fetch every session + booking that should land on the member calendar
 * for the `[weekStart, weekStart + 7d)` window.
 *
 * - Sessions come from `Enrollment` rows for each student in
 *   `studentIdsToShow`, filtered to `active` / `pending_payment` and
 *   non-cancelled sessions.
 * - Bookings come from `CourtBooking` either personally booked by the
 *   logged-in person OR belonging to their household.
 *
 * Pickup timing is resolved via `computeClassTiming`, same helper the
 * coach calendar uses — so on-the-clock anchors stay consistent across
 * portals.
 */
export async function getMemberCalendarEvents(
  personId: string,
  householdId: string | null,
  weekStart: Date,
  studentIdsToShow: MemberCalendarStudent[],
): Promise<MemberCalendarEvent[]> {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const studentIds = studentIdsToShow.map((s) => s.personId);
  const colorByStudent = new Map(
    studentIdsToShow.map((s) => [s.personId, s]),
  );

  const [enrollments, bookings] = await Promise.all([
    studentIds.length > 0
      ? prisma.enrollment.findMany({
          where: {
            studentPersonId: { in: studentIds },
            status: { in: ["active", "pending_payment"] },
          },
          select: {
            studentPersonId: true,
            classSeriesId: true,
          },
        })
      : Promise.resolve([] as { studentPersonId: string; classSeriesId: string }[]),
    prisma.courtBooking.findMany({
      where: {
        startsAt: { gte: weekStart, lt: weekEnd },
        cancelledAt: null,
        status: { in: ["confirmed", "cancellation_requested"] },
        OR: [
          { bookedByPersonId: personId },
          ...(householdId
            ? [{ bookedByHouseholdId: householdId } as const]
            : []),
        ],
      },
      orderBy: { startsAt: "asc" },
      include: {
        court: { select: { name: true } },
        club: { select: { name: true } },
        bookedByPerson: { select: { firstName: true } },
      },
    }),
  ]);

  // Build series → [studentPersonId, ...] map so one session expands into
  // one block per enrolled student (siblings in the same class each get
  // their own coloured block).
  const seriesToStudents = new Map<string, string[]>();
  for (const e of enrollments) {
    const arr = seriesToStudents.get(e.classSeriesId) ?? [];
    if (!arr.includes(e.studentPersonId)) arr.push(e.studentPersonId);
    seriesToStudents.set(e.classSeriesId, arr);
  }
  const seriesIds = Array.from(seriesToStudents.keys());

  const sessions =
    seriesIds.length > 0
      ? await prisma.classSession.findMany({
          where: {
            classSeriesId: { in: seriesIds },
            startsAt: { gte: weekStart, lt: weekEnd },
            cancelledAt: null,
            status: { not: "cancelled" },
          },
          orderBy: { startsAt: "asc" },
          include: {
            classSeries: {
              select: {
                id: true,
                name: true,
                deliveryMode: true,
                pickupAt: true,
                program: { select: { name: true } },
                venue: { select: { name: true } },
                school: {
                  select: {
                    name: true,
                    coachArriveAtHubMinutes: true,
                  },
                },
              },
            },
          },
        })
      : [];

  const sessionEvents: MemberCalendarEvent[] = [];
  for (const s of sessions) {
    const series = s.classSeries;
    const timing = computeClassTiming({
      session: { startsAt: s.startsAt, endsAt: s.endsAt },
      series: {
        deliveryMode: series.deliveryMode,
        pickupAt: series.pickupAt,
      },
      school: series.school
        ? { coachArriveAtHubMinutes: series.school.coachArriveAtHubMinutes }
        : null,
    });
    const blockStart = timing.pickupAt ?? timing.classStartAt;
    const blockMinutes = Math.max(
      30,
      Math.round(
        (timing.classEndAt.getTime() - blockStart.getTime()) / 60_000,
      ),
    );

    const owners = seriesToStudents.get(s.classSeriesId) ?? [];
    for (const ownerPersonId of owners) {
      const meta = colorByStudent.get(ownerPersonId);
      if (!meta) continue;
      sessionEvents.push({
        kind: "session",
        id: `${s.id}:${ownerPersonId}`,
        seriesName: series.name,
        programName: series.program.name,
        deliveryMode: series.deliveryMode,
        venueName: series.venue.name,
        schoolName: series.school?.name ?? null,
        leaveAt: null,
        pickupAt: timing.pickupAt ?? null,
        classStartAt: timing.classStartAt,
        classEndAt: timing.classEndAt,
        blockStart,
        blockMinutes,
        ownerPersonId,
        ownerFirstName: meta.firstName,
        colorIndex: meta.colorIndex,
      });
    }
  }

  const bookingEvents: MemberCalendarEvent[] = bookings.map((b) => ({
    kind: "booking",
    id: b.id,
    courtName: b.court.name,
    clubName: b.club.name,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    blockStart: b.startsAt,
    blockMinutes: Math.max(
      30,
      Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000),
    ),
    ownerPersonId: b.bookedByPersonId,
    ownerFirstName: b.bookedByPerson.firstName || "You",
  }));

  return [...sessionEvents, ...bookingEvents].sort(
    (a, b) => a.blockStart.getTime() - b.blockStart.getTime(),
  );
}
