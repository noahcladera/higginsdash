/**
 * Admin queries powering the `/admin/private-lessons` pages.
 *
 * Two inputs feed "unbilled coach court time":
 *
 *   1. One-off `CourtBooking` rows with `purpose = coaching`, status in
 *      {confirmed, completed}, that no `PaymentLine.courtBookingId`
 *      currently references.
 *   2. Occurrences of `RecurringBlock` rows with
 *      `purposeType = coach_private_lesson` that fall inside the period,
 *      minus the recurring block's `excludedDates`, minus any occurrence
 *      that's already been invoiced.
 *
 * Invoiced-occurrence tracking uses a conventional prefix in
 * `PaymentLine.description` so we don't need a schema migration:
 *
 *     "Recurring lesson YYYY-MM-DD HH:MM (NN min)"
 *
 * The YYYY-MM-DD timestamp uniquely identifies the occurrence.
 * `createCoachInvoice` always writes that prefix; this module parses
 * it back out when filtering.
 *
 * All pricing goes through `priceForDurationMinutes` so rates stay in
 * one place.
 *
 * `getCoachMonthLessonGrid` powers the per-coach month calendar shown
 * on the admin Finance detail page. It returns held + cancelled
 * one-off coaching bookings *and* recurring occurrences (uninvoiced
 * recurring occurrences only — invoiced ones are dropped to match the
 * unbilled list), bucketed by Amsterdam local date.
 */

import { prisma } from "@/lib/prisma";
import { amsterdamMidnightUtc, formatLocalDate } from "@/lib/booking/time";
import {
  priceForDurationMinutes,
  resolveCoachCourtRate,
} from "@/lib/invoicing/private-lesson-rates";
import { expandBlockOccurrences } from "@/lib/booking/recurring-block-expand";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CoachRoleKind = "staff" | "zzp" | "both";

export interface CoachWithUnbilled {
  coachPersonId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  /**
   * Which coach role(s) this person has — drives the role badge on the
   * list page. ZZP-only people are billed at the same default court rate
   * as staff coaches but don't expose a per-coach rate override (no
   * `Coach.courtRentalRate` row to write to).
   */
  roleKind: CoachRoleKind;
  oneOffCount: number;
  recurringOccurrenceCount: number;
  totalMinutes: number;
  totalEur: number;
}

export type CoachLineItem =
  | {
      kind: "one_off";
      /** Unique ref for selection / server action input. */
      refId: string;
      courtBookingId: string;
      courtId: string;
      courtName: string;
      clubName: string;
      startsAt: Date;
      endsAt: Date;
      minutes: number;
      amount: number;
    }
  | {
      kind: "recurring_occurrence";
      refId: string;
      recurringBlockId: string;
      description: string;
      courtId: string;
      courtName: string;
      clubName: string;
      /** UTC instant the occurrence starts. */
      occurrenceStartsAt: Date;
      occurrenceEndsAt: Date;
      minutes: number;
      amount: number;
    };

export interface CoachInvoiceRow {
  paymentId: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  issuedAt: Date | null;
  createdAt: Date;
  description: string;
  lineCount: number;
  mollieCheckoutUrl: string | null;
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** Convert a `YYYY-MM` string (or undefined) into a UTC period window. */
export function resolveMonthPeriod(
  monthParam: string | undefined,
): { periodStart: Date; periodEnd: Date; label: string; iso: string } {
  const now = new Date();
  let year: number;
  let month: number;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m;
  } else {
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }
  const periodStart = amsterdamMidnightUtc(year, month, 1);
  // First day of next month at midnight Amsterdam.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const periodEnd = amsterdamMidnightUtc(nextYear, nextMonth, 1);
  const iso = `${year}-${String(month).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(periodStart);
  return { periodStart, periodEnd, label, iso };
}

// ---------------------------------------------------------------------------
// Top-level: list of coaches with unbilled court time in a period
// ---------------------------------------------------------------------------

export async function getCoachesWithUnbilledCourtTime(
  periodStart: Date,
  periodEnd: Date,
): Promise<CoachWithUnbilled[]> {
  // Anyone with an active staff coach OR active ZZP coach record is a
  // potential biller — both flows produce `purpose=coaching` court bookings.
  const people = await prisma.person.findMany({
    where: {
      OR: [
        { coach: { isActive: true } },
        { zzpCoach: { isActive: true } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      coach: { select: { isActive: true } },
      zzpCoach: { select: { isActive: true } },
      emails: {
        where: { isPrimary: true },
        select: { address: true },
        take: 1,
      },
    },
    orderBy: { firstName: "asc" },
  });

  const results = await Promise.all(
    people.map(async (p) => {
      const items = await getUnbilledCoachLineItems(
        p.id,
        periodStart,
        periodEnd,
      );
      const oneOffCount = items.filter((i) => i.kind === "one_off").length;
      const recurringOccurrenceCount = items.filter(
        (i) => i.kind === "recurring_occurrence",
      ).length;
      const totalMinutes = items.reduce((s, i) => s + i.minutes, 0);
      const totalEur = items.reduce((s, i) => s + i.amount, 0);
      const isStaff = p.coach?.isActive === true;
      const isZzp = p.zzpCoach?.isActive === true;
      const roleKind: CoachRoleKind =
        isStaff && isZzp ? "both" : isZzp ? "zzp" : "staff";
      return {
        coachPersonId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.emails[0]?.address ?? null,
        roleKind,
        oneOffCount,
        recurringOccurrenceCount,
        totalMinutes,
        totalEur: Math.round(totalEur * 100) / 100,
      } satisfies CoachWithUnbilled;
    }),
  );

  return results
    .filter((r) => r.totalMinutes > 0)
    .sort((a, b) => b.totalEur - a.totalEur);
}

// ---------------------------------------------------------------------------
// Detail: unbilled line items for one coach
// ---------------------------------------------------------------------------

export async function getUnbilledCoachLineItems(
  coachPersonId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CoachLineItem[]> {
  // One-off bookings.
  const oneOffs = await prisma.courtBooking.findMany({
    where: {
      bookedByPersonId: coachPersonId,
      purpose: "coaching",
      status: { in: ["confirmed", "completed"] },
      startsAt: { gte: periodStart, lt: periodEnd },
      paymentLines: { none: {} },
    },
    include: {
      court: { select: { id: true, name: true } },
      club: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const { ratePerHour } = await resolveCoachCourtRate(coachPersonId);

  const oneOffItems: CoachLineItem[] = oneOffs.map((b) => {
    const minutes = Math.round(
      (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000,
    );
    return {
      kind: "one_off",
      refId: `one_off:${b.id}`,
      courtBookingId: b.id,
      courtId: b.court.id,
      courtName: b.court.name,
      clubName: b.club.name,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      minutes,
      amount: priceForDurationMinutes(minutes, ratePerHour),
    };
  });

  // Recurring blocks: expand into per-day occurrences inside the period.
  const blocks = await prisma.recurringBlock.findMany({
    where: {
      requesterPersonId: coachPersonId,
      purposeType: "coach_private_lesson",
      status: "active",
      // Any block whose date range intersects [periodStart, periodEnd).
      startsOn: { lt: periodEnd },
      endsOn: { gte: periodStart },
    },
    include: {
      court: { select: { id: true, name: true } },
      club: { select: { name: true } },
      paymentLines: { select: { description: true } },
    },
    orderBy: { startsOn: "asc" },
  });

  const recurringItems: CoachLineItem[] = [];
  for (const block of blocks) {
    // Already-invoiced YYYY-MM-DD HH:MM strings, extracted from line
    // descriptions (we encode occurrence timestamps there).
    const invoicedKeys = new Set<string>();
    for (const line of block.paymentLines) {
      const key = extractOccurrenceKey(line.description);
      if (key) invoicedKeys.add(key);
    }
    const occurrences = expandBlockOccurrences(
      {
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        startsOn: block.startsOn,
        endsOn: block.endsOn,
        excludedDates: block.excludedDates,
      },
      periodStart,
      periodEnd,
    );
    for (const occ of occurrences) {
      const occKey = `${formatLocalDate(occ.startsAt)} ${toHhMm(occ.startsAt)}`;
      if (invoicedKeys.has(occKey)) continue;
      const minutes = Math.round(
        (occ.endsAt.getTime() - occ.startsAt.getTime()) / 60_000,
      );
      recurringItems.push({
        kind: "recurring_occurrence",
        refId: `recurring:${block.id}:${occ.startsAt.toISOString()}`,
        recurringBlockId: block.id,
        description: block.purposeDescription,
        courtId: block.court.id,
        courtName: block.court.name,
        clubName: block.club.name,
        occurrenceStartsAt: occ.startsAt,
        occurrenceEndsAt: occ.endsAt,
        minutes,
        amount: priceForDurationMinutes(minutes, ratePerHour),
      });
    }
  }

  return [...oneOffItems, ...recurringItems].sort(
    (a, b) =>
      (a.kind === "one_off" ? a.startsAt : a.occurrenceStartsAt).getTime() -
      (b.kind === "one_off" ? b.startsAt : b.occurrenceStartsAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// History: past invoices for one coach
// ---------------------------------------------------------------------------

export async function listInvoicesForCoach(
  coachPersonId: string,
): Promise<CoachInvoiceRow[]> {
  const rows = await prisma.payment.findMany({
    where: {
      paidByPersonId: coachPersonId,
      invoiceNumber: { startsWith: "COACH-" },
    },
    include: {
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return rows.map((p) => ({
    paymentId: p.id,
    invoiceNumber: p.invoiceNumber,
    amount: Number(p.amount),
    status: p.status,
    issuedAt: p.issuedAt,
    createdAt: p.createdAt,
    description: p.description,
    lineCount: p._count.lines,
    mollieCheckoutUrl: p.mollieCheckoutUrl,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "Recurring lesson YYYY-MM-DD HH:MM (NN min)" into `YYYY-MM-DD HH:MM`. */
function extractOccurrenceKey(description: string): string | null {
  const m = description.match(
    /Recurring lesson (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/,
  );
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

function toHhMm(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Amsterdam",
  });
  return fmt.format(d);
}

// ---------------------------------------------------------------------------
// Calendar grid: per-day held + cancelled lessons for a coach's month
// ---------------------------------------------------------------------------

export interface CoachMonthHeldLesson {
  /** Stable ref for React keys. */
  refId: string;
  kind: "one_off" | "recurring_occurrence";
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  courtName: string;
  clubName: string;
}

export interface CoachMonthCancelledLesson {
  refId: string;
  courtBookingId: string;
  startsAt: Date;
  endsAt: Date;
  minutes: number;
  courtName: string;
  clubName: string;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  status: "cancelled" | "cancellation_requested";
}

export interface CoachMonthLessonDay {
  /** Amsterdam local YYYY-MM-DD. */
  dateKey: string;
  held: CoachMonthHeldLesson[];
  cancelled: CoachMonthCancelledLesson[];
}

export interface CoachMonthLessonGrid {
  byDay: Map<string, CoachMonthLessonDay>;
  totals: {
    heldCount: number;
    cancelledCount: number;
    heldMinutes: number;
  };
}

export async function getCoachMonthLessonGrid(
  coachPersonId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<CoachMonthLessonGrid> {
  // Held one-off coaching bookings (confirmed / completed).
  const heldOneOffs = await prisma.courtBooking.findMany({
    where: {
      bookedByPersonId: coachPersonId,
      purpose: "coaching",
      status: { in: ["confirmed", "completed"] },
      startsAt: { gte: periodStart, lt: periodEnd },
    },
    include: {
      court: { select: { name: true } },
      club: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Cancelled / pending-cancellation one-off coaching bookings.
  const cancelledOneOffs = await prisma.courtBooking.findMany({
    where: {
      bookedByPersonId: coachPersonId,
      purpose: "coaching",
      status: { in: ["cancelled", "cancellation_requested"] },
      startsAt: { gte: periodStart, lt: periodEnd },
    },
    include: {
      court: { select: { name: true } },
      club: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Recurring blocks intersecting the period.
  const blocks = await prisma.recurringBlock.findMany({
    where: {
      requesterPersonId: coachPersonId,
      purposeType: "coach_private_lesson",
      status: "active",
      startsOn: { lt: periodEnd },
      endsOn: { gte: periodStart },
    },
    include: {
      court: { select: { name: true } },
      club: { select: { name: true } },
    },
    orderBy: { startsOn: "asc" },
  });

  const byDay = new Map<string, CoachMonthLessonDay>();
  const ensureDay = (key: string): CoachMonthLessonDay => {
    let day = byDay.get(key);
    if (!day) {
      day = { dateKey: key, held: [], cancelled: [] };
      byDay.set(key, day);
    }
    return day;
  };

  for (const b of heldOneOffs) {
    const key = formatLocalDate(b.startsAt);
    const minutes = Math.round(
      (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000,
    );
    ensureDay(key).held.push({
      refId: `one_off:${b.id}`,
      kind: "one_off",
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      minutes,
      courtName: b.court.name,
      clubName: b.club.name,
    });
  }

  for (const b of cancelledOneOffs) {
    const key = formatLocalDate(b.startsAt);
    const minutes = Math.round(
      (b.endsAt.getTime() - b.startsAt.getTime()) / 60_000,
    );
    ensureDay(key).cancelled.push({
      refId: `cancelled:${b.id}`,
      courtBookingId: b.id,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      minutes,
      courtName: b.court.name,
      clubName: b.club.name,
      cancelledAt: b.cancelledAt,
      cancellationReason: b.cancellationReason,
      status: b.status as "cancelled" | "cancellation_requested",
    });
  }

  for (const block of blocks) {
    const occurrences = expandBlockOccurrences(
      {
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        startsOn: block.startsOn,
        endsOn: block.endsOn,
        excludedDates: block.excludedDates,
      },
      periodStart,
      periodEnd,
    );
    for (const occ of occurrences) {
      const key = formatLocalDate(occ.startsAt);
      const minutes = Math.round(
        (occ.endsAt.getTime() - occ.startsAt.getTime()) / 60_000,
      );
      ensureDay(key).held.push({
        refId: `recurring:${block.id}:${occ.startsAt.toISOString()}`,
        kind: "recurring_occurrence",
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        minutes,
        courtName: block.court.name,
        clubName: block.club.name,
      });
    }
  }

  // Sort each day's chips by start time.
  for (const day of byDay.values()) {
    day.held.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    day.cancelled.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  let heldCount = 0;
  let cancelledCount = 0;
  let heldMinutes = 0;
  for (const day of byDay.values()) {
    heldCount += day.held.length;
    cancelledCount += day.cancelled.length;
    for (const h of day.held) heldMinutes += h.minutes;
  }

  return {
    byDay,
    totals: { heldCount, cancelledCount, heldMinutes },
  };
}
