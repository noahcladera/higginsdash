import "server-only";

/**
 * Pricing for coach private-lesson court rental (server-side rate lookup).
 */

import { prisma } from "@/lib/prisma";
import {
  COACH_COURT_RATE_PER_HOUR,
  priceForDurationMinutes,
} from "./money";

export { COACH_COURT_RATE_PER_HOUR, formatEur, priceForDurationMinutes } from "./money";

/**
 * Resolved court-rental rate for invoicing / estimates.
 *
 * Lookup order: HTN staff `Coach.courtRentalRate`, then ZZP
 * `ZzpCoach.defaultCourtRentalRate`, then the global default.
 */
export async function resolveCoachCourtRate(
  coachPersonId: string,
): Promise<{ ratePerHour: number; isOverride: boolean }> {
  const person = await prisma.person.findUnique({
    where: { id: coachPersonId },
    select: {
      coach: { select: { courtRentalRate: true } },
      zzpCoach: { select: { defaultCourtRentalRate: true } },
    },
  });

  const staffRate = person?.coach?.courtRentalRate;
  if (staffRate != null) {
    return { ratePerHour: Number(staffRate), isOverride: true };
  }

  const zzpRate = person?.zzpCoach?.defaultCourtRentalRate;
  if (zzpRate != null) {
    return { ratePerHour: Number(zzpRate), isOverride: true };
  }

  return { ratePerHour: COACH_COURT_RATE_PER_HOUR, isOverride: false };
}

/** Convenience: resolve coach rate then price the duration. */
export async function priceForCoach(
  coachPersonId: string,
  minutes: number,
): Promise<number> {
  const { ratePerHour } = await resolveCoachCourtRate(coachPersonId);
  return priceForDurationMinutes(minutes, ratePerHour);
}
