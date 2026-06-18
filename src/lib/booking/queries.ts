/**
 * Read-side helpers for the booking system. Everything here is server-only;
 * pages and server actions call these to assemble the calendar grid + the
 * pending-deletion queue.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  amsterdamHourUtc,
  amsterdamMidnightUtc,
  bookingGridStepMinutes,
  buildBookingTimeSlots,
  formatLocalDate,
  formatLocalHour,
  parseLocalDate,
  addDays,
} from "./time";
import { recurringBlockHits } from "./rules";
import type {
  Court,
  BookingSettings,
  ClassSession,
  CourtBooking,
  RecurringBlock,
  Club,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarSlot {
  /** Local Amsterdam ISO datetime (e.g. 2026-04-21T09:00). */
  startsAtLocal: string;
  /** UTC Date for inserts. */
  startsAtUtc: Date;
  endsAtUtc: Date;
  state: CalendarSlotState;
}

export type CalendarSlotState =
  | { kind: "free" }
  | { kind: "outside_hours" }
  | {
      kind: "booked";
      bookingId: string;
      status: string;
      purpose: string;
      bookedByName: string;
      bookedByPersonId: string;
      partnerNames: string[];
      /** Set when status === "cancellation_requested". */
      cancellationReason?: string | null;
      cancellationRequestedAtIso?: string | null;
    }
  | { kind: "class"; classSessionId: string; label: string }
  | {
      kind: "recurring_block";
      recurringBlockId: string;
      label: string;
      /**
       * Heather feedback v1: surface the block scope so the coach
       * calendar can render `members_only` blocks as informational
       * (the slot is still bookable for coaches because the rule
       * engine — `recurringBlockHits(..., "coach")` — skips them).
       * Mirrors the `RecurringBlockScope` Prisma enum.
       */
      scope: "full" | "members_only";
      /** True when the viewer can still book over this block (coach + members_only). */
      coachCanBook: boolean;
    };

export interface CalendarCourt {
  id: string;
  name: string;
  isBookable: boolean;
  isLit: boolean;
  surface: string;
  qualityTier: string;
  /** Slot index → state for each day in the week (length: days × time rows). */
  slots: CalendarSlot[];
}

export interface CalendarWeek {
  club: Pick<Club, "id" | "name" | "slug">;
  settings: BookingSettings;
  /** Inclusive start, in 'YYYY-MM-DD' Amsterdam local. */
  startDate: string;
  /** Inclusive end. */
  endDate: string;
  /** Local-day labels in display order. */
  days: { date: string; weekday: string }[];
  /** Local start-time labels (e.g. ['09:00','09:30',...,'21:00']). */
  hours: string[];
  courts: CalendarCourt[];
}

// ---------------------------------------------------------------------------
// Public entry: full week grid for one club
// ---------------------------------------------------------------------------

export async function getCalendarWeek(args: {
  clubId: string;
  /** First local date of the displayed week. */
  startDate: string;
  /** Inclusive count of days, default 7. */
  days?: number;
  /**
   * Who is viewing the calendar. Coaches don't see `members_only` blocks
   * (those slots render as free since coaches can still use the court).
   * Admins and members see all blocks. Defaults to "member" (strictest).
   */
  viewerRole?: "admin" | "coach" | "member";
}): Promise<CalendarWeek> {
  const days = args.days ?? 7;
  const start = parseLocalDate(args.startDate);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = addDays(startUtc, days);

  const [club, settings, courts, bookings, classes, blocks] = await Promise.all(
    [
      prisma.club.findUniqueOrThrow({
        where: { id: args.clubId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.bookingSettings.findUniqueOrThrow({
        where: { clubId: args.clubId },
      }),
      prisma.court.findMany({
        where: { clubId: args.clubId, isActive: true },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.courtBooking.findMany({
        where: {
          clubId: args.clubId,
          startsAt: { gte: startUtc, lt: endUtc },
          status: { in: ["confirmed", "cancellation_requested"] },
        },
        include: {
          bookedByPerson: { select: { firstName: true, lastName: true } },
          partners: {
            select: { partnerName: true, displayOrder: true },
            orderBy: { displayOrder: "asc" },
          },
        },
      }),
      prisma.classSession.findMany({
        where: {
          courtId: { not: null },
          court: { clubId: args.clubId },
          startsAt: { gte: startUtc, lt: endUtc },
          status: { not: "cancelled" },
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          courtId: true,
          status: true,
          classSeries: {
            select: {
              name: true,
              deliveryMode: true,
              program: { select: { name: true } },
            },
          },
        },
      }),
      prisma.recurringBlock.findMany({
        where: {
          clubId: args.clubId,
          status: "active",
          startsOn: { lte: addDays(startUtc, days - 1) },
          endsOn: { gte: startUtc },
        },
        include: {
          classSeries: { select: { id: true, name: true } },
        },
      }),
    ],
  );

  const timeSlots = buildBookingTimeSlots({
    opensAtLocalTime: settings.opensAtLocalTime,
    closesAtLocalTime: settings.closesAtLocalTime,
    startTimeConstraint: settings.startTimeConstraint,
    bookingDurationMinutes: settings.bookingDurationMinutes,
  });

  // Day headers.
  const dayHeaders: { date: string; weekday: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startUtc, i);
    const dateStr = formatLocalDate(d);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Amsterdam",
      weekday: "short",
    }).format(d);
    dayHeaders.push({ date: dateStr, weekday });
  }

  const viewerRole = args.viewerRole ?? "member";

  const calendarCourts: CalendarCourt[] = courts.map((court) =>
    buildCourtSlots({
      court,
      dayHeaders,
      timeSlots,
      settings,
      bookings,
      classes,
      // Heather feedback v1: keep `members_only` blocks visible for
      // coaches as informational; the rule engine still lets them
      // book on top. Members continue to see them as opaque blocks.
      blocks,
      viewerRole,
    }),
  );

  return {
    club,
    settings,
    startDate: formatLocalDate(startUtc),
    endDate: formatLocalDate(addDays(startUtc, days - 1)),
    days: dayHeaders,
    hours: timeSlots.map(
      (s) =>
        `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
    ),
    courts: calendarCourts,
  };
}

function buildCourtSlots(args: {
  court: Court;
  dayHeaders: { date: string; weekday: string }[];
  timeSlots: { hour: number; minute: number }[];
  settings: BookingSettings;
  bookings: (CourtBooking & {
    bookedByPerson: { firstName: string; lastName: string };
    partners: { partnerName: string; displayOrder: number }[];
  })[];
  classes: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    courtId: string | null;
    status: string;
    classSeries: {
      name: string;
      deliveryMode: "at_club" | "onsite" | "pickup";
      program: { name: string };
    };
  }[];
  blocks: (RecurringBlock & {
    classSeries: { id: string; name: string } | null;
  })[];
  viewerRole: "admin" | "coach" | "member";
}): CalendarCourt {
  const slots: CalendarSlot[] = [];
  for (const day of args.dayHeaders) {
    const local = parseLocalDate(day.date);
    for (const slot of args.timeSlots) {
      const startsAtUtc = amsterdamHourUtc(
        local.year,
        local.month,
        local.day,
        slot.hour,
        slot.minute,
      );
      const rowWindowMinutes = bookingGridStepMinutes(
        args.settings.startTimeConstraint,
      );
      const endsAtUtc = new Date(
        startsAtUtc.getTime() + rowWindowMinutes * 60_000,
      );

      const state = computeSlotState({
        startsAtUtc,
        endsAtUtc,
        court: args.court,
        bookings: args.bookings,
        classes: args.classes,
        blocks: args.blocks,
        viewerRole: args.viewerRole,
      });

      slots.push({
        startsAtLocal: `${day.date}T${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`,
        startsAtUtc,
        endsAtUtc,
        state,
      });
    }
  }

  return {
    id: args.court.id,
    name: args.court.name,
    isBookable: args.court.isBookable,
    isLit: args.court.isLit,
    surface: args.court.surface,
    qualityTier: args.court.qualityTier,
    slots,
  };
}

function computeSlotState(args: {
  startsAtUtc: Date;
  endsAtUtc: Date;
  court: Court;
  bookings: (CourtBooking & {
    bookedByPerson: { firstName: string; lastName: string };
    partners: { partnerName: string; displayOrder: number }[];
  })[];
  classes: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    courtId: string | null;
    status: string;
    classSeries: {
      name: string;
      deliveryMode: "at_club" | "onsite" | "pickup";
      program: { name: string };
    };
  }[];
  blocks: (RecurringBlock & {
    classSeries: { id: string; name: string } | null;
  })[];
  viewerRole: "admin" | "coach" | "member";
}): CalendarSlotState {
  // 1. existing booking on this court that overlaps slot window.
  const booking = args.bookings.find(
    (b) =>
      b.courtId === args.court.id &&
      b.startsAt < args.endsAtUtc &&
      b.endsAt > args.startsAtUtc,
  );
  if (booking) {
    return {
      kind: "booked",
      bookingId: booking.id,
      status: booking.status,
      purpose: booking.purpose,
      bookedByPersonId: booking.bookedByPersonId,
      bookedByName: `${booking.bookedByPerson.firstName} ${booking.bookedByPerson.lastName}`.trim(),
      partnerNames: booking.partners.map((p) => p.partnerName),
      cancellationReason: booking.cancellationReason ?? null,
      cancellationRequestedAtIso:
        booking.cancellationRequestedAt?.toISOString() ?? null,
    };
  }

  // 2. class session overlap.
  const klass = args.classes.find(
    (c) =>
      c.courtId === args.court.id &&
      c.startsAt < args.endsAtUtc &&
      c.endsAt > args.startsAtUtc,
  );
  if (klass) {
    const label =
      klass.classSeries.name || klass.classSeries.program.name || "Class";
    return {
      kind: "class",
      classSessionId: klass.id,
      label,
    };
  }

  // 3. recurring block overlap (active blocks only).
  // We pass `viewerRole = undefined` to `recurringBlockHits` here so
  // that it doesn't pre-filter `members_only` blocks for coaches —
  // those should still be visualized on the coach calendar (they just
  // don't *block* the coach from booking on top). The flag below
  // tells the UI whether the viewer can still book through.
  const block = args.blocks.find((b) =>
    recurringBlockHits(
      {
        startsAt: args.startsAtUtc,
        endsAt: args.endsAtUtc,
        courtId: args.court.id,
      },
      b,
    ),
  );
  if (block) {
    const label =
      block.classSeriesId && block.classSeries?.name
        ? block.classSeries.name
        : block.purposeDescription;
    const coachCanBook =
      block.scope === "members_only" &&
      (args.viewerRole === "coach" || args.viewerRole === "admin");
    return {
      kind: "recurring_block",
      recurringBlockId: block.id,
      label,
      scope: block.scope,
      coachCanBook,
    };
  }

  return { kind: "free" };
}

// ---------------------------------------------------------------------------
// Pending coach-cancellation requests, for /admin/bookings/deletions
// ---------------------------------------------------------------------------

export async function getPendingCancellationRequests() {
  return prisma.courtBooking.findMany({
    where: { status: "cancellation_requested" },
    orderBy: { cancellationRequestedAt: "asc" },
    include: {
      bookedByPerson: { select: { id: true, firstName: true, lastName: true } },
      court: { select: { id: true, name: true } },
      club: { select: { id: true, name: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// One booking with everything you need to render a detail card
// ---------------------------------------------------------------------------

export async function getBookingForDecision(bookingId: string) {
  return prisma.courtBooking.findUnique({
    where: { id: bookingId },
    include: {
      bookedByPerson: true,
      court: true,
      club: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Coach hours report
// ---------------------------------------------------------------------------

export interface CoachHoursRow {
  weekStart: string; // YYYY-MM-DD local Monday
  hours: number;
  bookingCount: number;
}

export async function getCoachHoursReport(args: {
  coachPersonId: string;
  /** Start month boundary, local. */
  startDate: string;
  /** Exclusive end. */
  endDate: string;
}): Promise<{ rows: CoachHoursRow[]; totalHours: number }> {
  const start = parseLocalDate(args.startDate);
  const end = parseLocalDate(args.endDate);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = amsterdamMidnightUtc(end.year, end.month, end.day);

  const bookings = await prisma.courtBooking.findMany({
    where: {
      bookedByPersonId: args.coachPersonId,
      purpose: "coaching",
      status: { in: ["confirmed", "completed"] },
      startsAt: { gte: startUtc, lt: endUtc },
    },
    select: { startsAt: true, endsAt: true },
  });

  const byWeek = new Map<string, { hours: number; bookingCount: number }>();
  let totalHours = 0;
  for (const b of bookings) {
    const hrs = (b.endsAt.getTime() - b.startsAt.getTime()) / (60 * 60_000);
    totalHours += hrs;
    const local = formatLocalDate(b.startsAt);
    const monday = mondayOf(local);
    const cur = byWeek.get(monday) ?? { hours: 0, bookingCount: 0 };
    cur.hours += hrs;
    cur.bookingCount += 1;
    byWeek.set(monday, cur);
  }

  return {
    rows: [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        hours: v.hours,
        bookingCount: v.bookingCount,
      })),
    totalHours,
  };
}

export function mondayOf(yyyymmdd: string): string {
  const d = parseLocalDate(yyyymmdd);
  const utc = amsterdamMidnightUtc(d.year, d.month, d.day);
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(utc);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const back = map[dow] ?? 0;
  return formatLocalDate(addDays(utc, -back));
}

export { formatLocalHour, formatLocalDate };
