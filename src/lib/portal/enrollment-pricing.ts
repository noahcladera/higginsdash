/**
 * Pure pricing helper for the parent-portal enrollment flow.
 *
 * Drives both the interactive checkout block in `<EnrollPanel>` and
 * the server-side snapshot we persist on `Enrollment` when a parent
 * confirms. Keeping it pure means the same numbers show on screen and
 * land in the database — no drift between client and server.
 *
 * Two ideas captured here:
 *
 *   1. **Mid-series proration.** A parent who enrolls when the term
 *      is half over only pays for sessions still ahead of them. We
 *      treat a session as "past" the moment its `startsAt` has
 *      elapsed — once a class has begun you can't attend its start.
 *
 *   2. **Membership add-on.** Lessons at a Higgins club are only
 *      available to members. When the chosen student doesn't already
 *      hold a membership covering the venue's club, we surface the
 *      single-club membership price as an add-on so the parent sees
 *      one honest total. The add-on is part of the same Mollie
 *      payment as the lesson — once the payment confirms,
 *      `createEnrollment(payload, paymentContext)` calls
 *      `grantEnrollmentMembership` to write the actual `Membership`
 *      row (single-club, assigned to the student being enrolled,
 *      one-year term).
 */

import { priceForRandwijck, priceForTriaz } from "@/lib/pricing";

export interface EnrollmentPricingInput {
  /** Series catalog price for the full term, or null when none is set. */
  pricePerSeries: number | null;
  /** All non-cancelled sessions on the series. Order doesn't matter. */
  sessions: { startsAt: Date }[];
  /** Reference time used to split past vs upcoming sessions. */
  now: Date;
  /**
   * The club hosting the series. We use it to decide which
   * single-club membership price to quote when the student isn't
   * already a member. `null` means we can't determine the venue club
   * (e.g. an "onsite" series at a partner location) and we'll skip
   * the membership add-on rather than guess.
   */
  venueClubSlug: "triaz" | "randwijck" | null;
  /**
   * True when the chosen student already has an active membership
   * that covers `venueClubSlug`. When true, no add-on is quoted.
   */
  hasActiveMembership: boolean;
  /**
   * Drives the membership tier price. "child" maps to the kids price,
   * "adult" to the adult price. Family-tier upsells happen on the
   * dedicated membership page, not here.
   */
  candidateAgeBracket: "child" | "adult";
  /**
   * True when the buying household has any prior membership row.
   * Returning members never prorate — they pay the full annual rate
   * for the add-on.
   */
  isReturningHousehold?: boolean;
  /**
   * When true, never quote a membership add-on (e.g. events with an
   * explicit member price tier).
   */
  suppressMembershipAddOn?: boolean;
  /**
   * Camp-mode override. When set, pricing comes from the chosen camp
   * option (week/drop-in) instead of the derived series/session math.
   */
  campSelectionPrice?: number | null;
  /**
   * Daily drop-ins never include or auto-grant memberships.
   */
  campSelectionKind?: "full_week" | "daily_drop_in" | null;
}

export interface EnrollmentPricingBreakdown {
  totalSessions: number;
  pastSessions: number;
  remainingSessions: number;
  /** pricePerSeries / totalSessions, rounded to 2 decimals. */
  pricePerSession: number | null;
  fullSeriesPrice: number | null;
  /** pricePerSession * pastSessions, rounded to whole euros. */
  missedDeduction: number;
  /** fullSeriesPrice - missedDeduction, rounded to whole euros. */
  payableLesson: number | null;
  /** 0 when hasActiveMembership; else MEMBERSHIP_PRICES[bracket].single. */
  membershipAddOn: number | null;
  /** payableLesson + membershipAddOn. Null when payableLesson is null. */
  total: number | null;
  /** Documents the proration policy in case we ever change it. */
  policy: "starts_at";
}

/** Round to whole euros. Display layer uses this to keep numbers clean. */
function roundEur(n: number): number {
  return Math.round(n);
}

/** Round to 2 decimals for per-session math. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeEnrollmentPricing(
  input: EnrollmentPricingInput,
): EnrollmentPricingBreakdown {
  const totalSessions = input.sessions.length;
  const pastSessions = input.sessions.filter(
    (s) => s.startsAt.getTime() <= input.now.getTime(),
  ).length;
  const remainingSessions = Math.max(0, totalSessions - pastSessions);

  if (input.campSelectionPrice != null) {
    const payableLesson = roundEur(input.campSelectionPrice);
    const addOn = membershipAddOnFor({
      ...input,
      suppressMembershipAddOn:
        input.suppressMembershipAddOn || input.campSelectionKind === "daily_drop_in",
    });
    return {
      totalSessions,
      pastSessions,
      remainingSessions,
      pricePerSession: null,
      fullSeriesPrice: payableLesson,
      missedDeduction: 0,
      payableLesson,
      membershipAddOn: addOn,
      total: payableLesson + (addOn ?? 0),
      policy: "starts_at",
    };
  }

  // No price set on the series → office handles pricing manually. We
  // still report the session counts so the UI can communicate scope,
  // but every monetary field stays null so the caller can fall back
  // to "Contact the office for pricing".
  if (input.pricePerSeries == null) {
    return {
      totalSessions,
      pastSessions,
      remainingSessions,
      pricePerSession: null,
      fullSeriesPrice: null,
      missedDeduction: 0,
      payableLesson: null,
      membershipAddOn: membershipAddOnFor(input),
      total: null,
      policy: "starts_at",
    };
  }

  const fullSeriesPrice = roundEur(input.pricePerSeries);

  // Defensive: a series with zero sessions can't be prorated. Quote
  // the full price so we never inadvertently bill €0 because the
  // schedule wasn't generated yet.
  if (totalSessions === 0) {
    const addOn = membershipAddOnFor(input);
    return {
      totalSessions,
      pastSessions: 0,
      remainingSessions: 0,
      pricePerSession: null,
      fullSeriesPrice,
      missedDeduction: 0,
      payableLesson: fullSeriesPrice,
      membershipAddOn: addOn,
      total: fullSeriesPrice + (addOn ?? 0),
      policy: "starts_at",
    };
  }

  const pricePerSession = round2(input.pricePerSeries / totalSessions);
  const missedDeduction = roundEur(pricePerSession * pastSessions);
  const payableLesson = Math.max(0, fullSeriesPrice - missedDeduction);
  const addOn = membershipAddOnFor(input);

  return {
    totalSessions,
    pastSessions,
    remainingSessions,
    pricePerSession,
    fullSeriesPrice,
    missedDeduction,
    payableLesson,
    membershipAddOn: addOn,
    total: payableLesson + (addOn ?? 0),
    policy: "starts_at",
  };
}

/**
 * Resolve the membership add-on. Returns 0 when the student is
 * already covered, the catalog single-club price when they aren't,
 * and null when we can't determine the venue club (skip the line
 * altogether rather than quote a wrong number).
 */
function membershipAddOnFor(input: EnrollmentPricingInput): number | null {
  if (input.suppressMembershipAddOn) return 0;
  if (input.hasActiveMembership) return 0;
  if (input.venueClubSlug == null) return null;
  const tier = input.candidateAgeBracket === "child" ? "child" : "adult";
  const ctx = {
    joinDate: input.now,
    isReturning: input.isReturningHousehold ?? false,
  };
  return input.venueClubSlug === "triaz"
    ? priceForTriaz({ tier, ctx })
    : priceForRandwijck({ tier, ctx });
}

/**
 * Convenience: derive the age bracket from a candidate's age. We
 * follow the same 16+ rule already used by the recommendation engine
 * (see `recommend-queries.ts`).
 */
export function ageBracketFromAge(age: number | null): "child" | "adult" {
  return age != null && age < 16 ? "child" : "adult";
}
