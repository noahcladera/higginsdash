/**
 * Work hours for coaches: time on assigned class sessions (invoice Higgins),
 * with pay estimates from session → series → coach default rate chain.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";
import { mondayOf } from "@/lib/booking/queries";

export interface CoachWorkHoursRow {
  weekStart: string;
  hours: number;
  sessionCount: number;
  payEstimate: number;
  unrated: boolean;
}

export interface CoachWorkHoursReport {
  rows: CoachWorkHoursRow[];
  totalHours: number;
  totalPayEstimate: number;
  deliveredHours: number;
  upcomingHours: number;
  hasMissingRates: boolean;
}

function decimalToNumber(d: unknown): number | null {
  if (d == null) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

export async function getCoachWorkHoursReport(args: {
  coachPersonId: string;
  startDate: string;
  endDate: string;
}): Promise<CoachWorkHoursReport> {
  const start = parseLocalDate(args.startDate);
  const end = parseLocalDate(args.endDate);
  const startUtc = amsterdamMidnightUtc(start.year, start.month, start.day);
  const endUtc = amsterdamMidnightUtc(end.year, end.month, end.day);

  const [coachDefault, assignments] = await Promise.all([
    prisma.coach.findUnique({
      where: { personId: args.coachPersonId },
      select: { defaultHourlyRate: true },
    }),
    prisma.classSessionCoach.findMany({
      where: {
        coachPersonId: args.coachPersonId,
        classSession: {
          startsAt: { gte: startUtc, lt: endUtc },
          status: { not: "cancelled" },
        },
      },
      include: {
        classSession: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            classSeriesId: true,
          },
        },
      },
    }),
  ]);

  const defaultPay = decimalToNumber(coachDefault?.defaultHourlyRate);

  const seriesIds = [
    ...new Set(assignments.map((a) => a.classSession.classSeriesId)),
  ];
  const seriesCoaches =
    seriesIds.length === 0
      ? []
      : await prisma.classSeriesCoach.findMany({
          where: {
            coachPersonId: args.coachPersonId,
            classSeriesId: { in: seriesIds },
          },
          select: { classSeriesId: true, payRateOverride: true },
        });
  const seriesRateById = new Map(
    seriesCoaches.map((sc) => [
      sc.classSeriesId,
      decimalToNumber(sc.payRateOverride),
    ]),
  );

  const byWeek = new Map<
    string,
    { hours: number; sessionCount: number; payEstimate: number; unrated: boolean }
  >();

  let totalHours = 0;
  let totalPayEstimate = 0;
  let deliveredHours = 0;
  let upcomingHours = 0;
  let hasMissingRates = false;

  for (const a of assignments) {
    const s = a.classSession;
    const minutes = Math.round(
      (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000,
    );
    if (minutes <= 0) continue;
    const hrs = minutes / 60;
    totalHours += hrs;

    if (s.status === "completed") {
      deliveredHours += hrs;
    } else if (s.status === "scheduled" || s.status === "in_progress") {
      upcomingHours += hrs;
    }

    const sessionOverride = decimalToNumber(a.payRateOverride);
    const seriesOverride = seriesRateById.get(s.classSeriesId) ?? null;
    const rate =
      sessionOverride ?? seriesOverride ?? defaultPay ?? null;
    if (rate == null) {
      hasMissingRates = true;
    }
    const pay = rate != null ? Math.round(rate * hrs * 100) / 100 : 0;
    totalPayEstimate += pay;

    const local = formatLocalDate(s.startsAt);
    const monday = mondayOf(local);
    const cur =
      byWeek.get(monday) ?? {
        hours: 0,
        sessionCount: 0,
        payEstimate: 0,
        unrated: false,
      };
    cur.hours += hrs;
    cur.sessionCount += 1;
    cur.payEstimate += pay;
    if (rate == null) cur.unrated = true;
    byWeek.set(monday, cur);
  }

  totalPayEstimate = Math.round(totalPayEstimate * 100) / 100;

  return {
    rows: [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, v]) => ({
        weekStart,
        hours: v.hours,
        sessionCount: v.sessionCount,
        payEstimate: Math.round(v.payEstimate * 100) / 100,
        unrated: v.unrated,
      })),
    totalHours,
    totalPayEstimate,
    deliveredHours,
    upcomingHours,
    hasMissingRates,
  };
}
