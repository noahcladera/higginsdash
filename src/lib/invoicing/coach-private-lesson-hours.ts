/**
 * Coach-facing aggregation of private-lesson court time: one-off coaching
 * bookings plus expanded recurring private-lesson blocks (same geometry as
 * admin invoicing, but counts all occurrences in range except excluded dates).
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { expandBlockOccurrences } from "@/lib/booking/recurring-block-expand";
import {
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";
import { mondayOf, type CoachHoursRow } from "@/lib/booking/queries";
import {
  priceForDurationMinutes,
  resolveCoachCourtRate,
} from "@/lib/invoicing/private-lesson-rates";

export interface CoachPrivateLessonHoursReport {
  rows: CoachHoursRow[];
  totalHours: number;
  /** One-off bookings + recurring occurrences in range. */
  totalSessions: number;
  estimatedCourtRentalEur: number;
  ratePerHour: number;
  isRateOverride: boolean;
}

export async function getCoachPrivateLessonHoursReport(args: {
  coachPersonId: string;
  startDate: string;
  endDate: string;
}): Promise<CoachPrivateLessonHoursReport> {
  const start = parseLocalDate(args.startDate);
  const end = parseLocalDate(args.endDate);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = amsterdamMidnightUtc(end.year, end.month, end.day);

  const [{ ratePerHour, isOverride: isRateOverride }, bookings, blocks] =
    await Promise.all([
      resolveCoachCourtRate(args.coachPersonId),
      prisma.courtBooking.findMany({
        where: {
          bookedByPersonId: args.coachPersonId,
          purpose: "coaching",
          status: { in: ["confirmed", "completed"] },
          startsAt: { gte: startUtc, lt: endUtc },
        },
        select: { startsAt: true, endsAt: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.recurringBlock.findMany({
        where: {
          requesterPersonId: args.coachPersonId,
          purposeType: "coach_private_lesson",
          status: "active",
          startsOn: { lt: endUtc },
          endsOn: { gte: startUtc },
        },
        select: {
          excludedDates: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          startsOn: true,
          endsOn: true,
        },
      }),
    ]);

  const byWeek = new Map<string, { hours: number; bookingCount: number }>();
  let totalMinutes = 0;
  let totalSessions = 0;
  let estimatedCourtRentalEur = 0;

  const bump = (startsAt: Date, endsAt: Date) => {
    const minutes = Math.round(
      (endsAt.getTime() - startsAt.getTime()) / 60_000,
    );
    if (minutes <= 0) return;
    const hrs = minutes / 60;
    totalMinutes += minutes;
    totalSessions += 1;
    estimatedCourtRentalEur += priceForDurationMinutes(minutes, ratePerHour);
    const local = formatLocalDate(startsAt);
    const monday = mondayOf(local);
    const cur = byWeek.get(monday) ?? { hours: 0, bookingCount: 0 };
    cur.hours += hrs;
    cur.bookingCount += 1;
    byWeek.set(monday, cur);
  };

  for (const b of bookings) {
    bump(b.startsAt, b.endsAt);
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
      startUtc,
      endUtc,
    );
    for (const occ of occurrences) {
      bump(occ.startsAt, occ.endsAt);
    }
  }

  estimatedCourtRentalEur = Math.round(estimatedCourtRentalEur * 100) / 100;
  const totalHours = totalMinutes / 60;

  return {
    rows: [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        hours: v.hours,
        bookingCount: v.bookingCount,
      })),
    totalHours,
    totalSessions,
    estimatedCourtRentalEur,
    ratePerHour,
    isRateOverride: isRateOverride,
  };
}
