/**
 * Pure rule functions for court bookings. Everything in here is deterministic
 * and side-effect free; the actions module composes these into a single
 * "can this booker book this slot?" check before hitting the DB.
 *
 * Implements the constraints from design/database.md §5.x for court bookings:
 *  - R-court-bookable: court must be active + bookable.
 *  - R-club-hours: slot inside opens_at..closes_at local Amsterdam.
 *  - R-window: starts_at within [now+earliest_offset, now+latest_offset_days].
 *  - R-on-the-hour: respects start_time_constraint.
 *  - R-quota: one booking per member per day per club (configurable).
 *  - R-membership: the booker (the actor placing the booking) is
 *    individually covered at this club — either via a family
 *    membership in their household, or via a single-club individual
 *    membership assigned to them. A spouse's individual seat does NOT
 *    count for them. Single source of truth lives in
 *    `src/lib/memberships/coverage.ts`.
 *  - R-class/recurring overlap: slot doesn't overlap a class session or active recurring block.
 *  - R-coaching-bypass: coach booking with purpose=coaching bypasses
 *    quota / window / membership / payment / partner rules. The court must
 *    still be bookable, the slot must still respect club hours and class /
 *    recurring overlaps, and Postgres' EXCLUDE constraint still blocks
 *    same-court overlap with other bookings.
 */

import {
  amsterdamDayOfWeek,
  amsterdamHourUtc,
  formatLocalDate,
  formatLocalHour,
  parseLocalDate,
  timeToHourMinute,
} from "./time";

import type {
  BookingPurpose,
  Court,
  BookingSettings,
  ClassSession,
  CourtBooking,
  RecurringBlock,
  CourtBookingStatus,
} from "@prisma/client";
import { DEFAULT_TERMS, decapitalize, type Terms } from "@/lib/tenant/terms";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What kind of actor is making/managing this booking. */
export type BookerRole = "admin" | "coach" | "member";

/** Caller identity passed to every rule check. */
export interface Booker {
  personId: string;
  householdId: string | null;
  role: BookerRole;
  /**
   * Heather feedback v1: ZZP coaches (self-employed, on a separate
   * commercial agreement) are capped at booking courts 7 days in
   * advance. Staff (HTN) coaches and admins keep the wide horizon they
   * already enjoy. Set by `resolveActor` based on whether the person's
   * `zzpCoach` row is the *only* active coach role.
   */
  isZzpCoach?: boolean;
}

/** Heather feedback v1: ZZP coaches can only book this many days ahead. */
export const ZZP_COACH_MAX_LEAD_DAYS = 7;

/** Slot the user is trying to claim. */
export interface SlotRequest {
  court: Pick<
    Court,
    "id" | "clubId" | "isActive" | "isBookable" | "isLit" | "name"
  >;
  startsAt: Date; // UTC
  endsAt: Date; // UTC
}

/** Reasons a booking can be refused. Stable codes for UI mapping. */
export type RuleViolation =
  | { code: "court_not_bookable"; message: string }
  | { code: "outside_club_hours"; message: string }
  | { code: "outside_booking_window"; message: string }
  | { code: "bad_start_time"; message: string }
  | { code: "bad_duration"; message: string }
  | { code: "quota_exceeded"; message: string }
  | { code: "no_active_membership"; message: string }
  | { code: "overlaps_class"; message: string }
  | { code: "overlaps_recurring_block"; message: string }
  | { code: "overlaps_existing_booking"; message: string }
  | { code: "needs_partner_count"; message: string }
  | { code: "payment_required_but_unpaid"; message: string };

export type RuleResult =
  | { ok: true }
  | { ok: false; violations: RuleViolation[] };

// ---------------------------------------------------------------------------
// Top-level check
// ---------------------------------------------------------------------------

export interface RuleContext {
  booker: Booker;
  purpose: BookingPurpose; // 'personal' | 'coaching'
  slot: SlotRequest;
  settings: BookingSettings;
  /**
   * Coverage check for the booker (1 if covered at this club, 0
   * otherwise). Computed by the caller via
   * `personIsCovered({ personId: booker.personId, ... })` so the
   * "is covered?" rule is applied uniformly across enrollment,
   * booking, and ladder.
   */
  activeMembershipsCount: number;
  /** Confirmed/cancellation_requested bookings on this club for the booker today. */
  bookerBookingsTodayCount: number;
  /** Class sessions that touch this slot's window on this court (any status). */
  conflictingClassSessions: Pick<
    ClassSession,
    "id" | "startsAt" | "endsAt" | "status"
  >[];
  /** Active recurring blocks on this court whose date+time overlap the slot. */
  conflictingRecurringBlocks: Pick<
    RecurringBlock,
    "id" | "purposeDescription"
  >[];
  /** Number of partners on the booking, post-validation. */
  partnerCount: number;
  now: Date;
  /** Tenant glossary for user-facing violation messages. */
  terms?: Terms;
}

export function checkBookingRules(ctx: RuleContext): RuleResult {
  const { booker, purpose, slot, settings, now } = ctx;
  const t = ctx.terms ?? DEFAULT_TERMS;
  const v: RuleViolation[] = [];

  // R-admin-bypass: admins can do anything except violate physical rules
  // (overlaps + court bookability are still enforced).
  //
  // Coaches count as implicit members of every club we operate — they're
  // on-site staff, need courts for their job, and should never be blocked
  // by membership / window / quota rules regardless of whether the
  // booking is coaching or personal. Physical overlap + court bookability
  // still apply.
  const isAdmin = booker.role === "admin";
  const isCoach = booker.role === "coach";
  const bypassMemberRules = isAdmin || isCoach;

  // R-court-bookable.
  if (!slot.court.isActive || !slot.court.isBookable) {
    v.push({
      code: "court_not_bookable",
      message: `${t.court.singular} ${slot.court.name} is not available for booking (walk-on only or inactive).`,
    });
  }

  // R-bad-duration. Personal bookings lock to the club default. Coaching
  // bookings (coach or admin) may pick from {30, 45, 60} so private-lesson
  // half-hour / three-quarter-hour slots are allowed.
  const actualMs = slot.endsAt.getTime() - slot.startsAt.getTime();
  const actualMinutes = Math.round(actualMs / 60_000);
  const expectedMs = settings.bookingDurationMinutes * 60_000;
  if (purpose === "coaching") {
    if (![30, 45, 60].includes(actualMinutes)) {
      v.push({
        code: "bad_duration",
        message: `${t.privateLesson.singular} bookings must be 30, 45, or 60 minutes.`,
      });
    }
  } else if (actualMs !== expectedMs) {
    v.push({
      code: "bad_duration",
      message: `This ${t.club.singular.toLowerCase()} books in ${settings.bookingDurationMinutes}-minute slots.`,
    });
  }

  // R-club-hours: starts >= opens_at AND ends <= closes_at on the same local day.
  if (!isWithinClubHours(slot, settings)) {
    const opens = formatHHMM(settings.opensAtLocalTime);
    const closes = formatHHMM(settings.closesAtLocalTime);
    v.push({
      code: "outside_club_hours",
      message: `${t.club.singular} is open ${opens}–${closes} local time.`,
    });
  }

  // R-on-the-hour.
  if (!startTimeMatches(slot.startsAt, settings.startTimeConstraint)) {
    v.push({
      code: "bad_start_time",
      message: `Bookings must start ${labelStartConstraint(settings.startTimeConstraint)}.`,
    });
  }

  // R-window (skipped for admin + coaching bookings).
  if (!bypassMemberRules) {
    const earliest = new Date(
      now.getTime() + settings.earliestBookingOffsetMinutes * 60_000,
    );
    const latest = new Date(
      now.getTime() + settings.latestBookingOffsetDays * 24 * 60 * 60_000,
    );
    if (slot.startsAt < earliest) {
      v.push({
        code: "outside_booking_window",
        message: `Bookings must be at least ${settings.earliestBookingOffsetMinutes} minutes in the future.`,
      });
    }
    if (slot.startsAt > latest) {
      v.push({
        code: "outside_booking_window",
        message: `Bookings can be made at most ${settings.latestBookingOffsetDays} days in advance.`,
      });
    }

    // R-quota.
    if (
      ctx.bookerBookingsTodayCount >= settings.maxBookingsPerMemberPerDay
    ) {
      v.push({
        code: "quota_exceeded",
        message: `You already have ${settings.maxBookingsPerMemberPerDay} booking(s) on this day at this ${t.club.singular.toLowerCase()}.`,
      });
    }

    // R-membership.
    if (ctx.activeMembershipsCount === 0) {
      v.push({
        code: "no_active_membership",
        message: `Your ${t.household.singular.toLowerCase()} needs an active ${t.membership.singular.toLowerCase()} covering this ${t.club.singular.toLowerCase()}.`,
      });
    }

    // R-partner-count: only enforced for member bookings; coaching/admin skip.
    if (
      ctx.partnerCount < settings.minPartners ||
      ctx.partnerCount > settings.maxPartners
    ) {
      v.push({
        code: "needs_partner_count",
        message: `This ${t.club.singular.toLowerCase()} requires ${settings.minPartners}–${settings.maxPartners} partner(s) per booking.`,
      });
    }
  }

  // R-class / R-recurring overlap (everyone enforced — physical reality).
  const blockingClasses = ctx.conflictingClassSessions.filter(
    (s) => s.status !== "cancelled",
  );
  if (blockingClasses.length > 0) {
    v.push({
      code: "overlaps_class",
      message: `This slot is reserved for a ${decapitalize(t.class.singular)}.`,
    });
  }
  if (ctx.conflictingRecurringBlocks.length > 0) {
    const desc = ctx.conflictingRecurringBlocks[0].purposeDescription;
    v.push({
      code: "overlaps_recurring_block",
      message: `This slot is blocked: ${desc}.`,
    });
  }

  // Heather feedback v1: ZZP coaches don't get the unlimited horizon
  // staff coaches do. They can book up to 7 days out (rolling); past
  // that they need to talk to the office. Apply to both personal and
  // coaching bookings — the cap is about scarce-court fairness, not
  // about lesson type. Admins always bypass (they're scheduling on
  // behalf of the office).
  if (
    booker.role === "coach" &&
    booker.isZzpCoach &&
    !isAdmin
  ) {
    const zzpCutoff = new Date(
      now.getTime() + ZZP_COACH_MAX_LEAD_DAYS * 24 * 60 * 60_000,
    );
    if (slot.startsAt > zzpCutoff) {
      v.push({
        code: "outside_booking_window",
        message: `You can book at most ${ZZP_COACH_MAX_LEAD_DAYS} days ahead with a contracting ${decapitalize(t.coach.singular)} profile. Contact the office for anything further out.`,
      });
    }
  }

  // Note: same-court CourtBooking overlap is enforced by Postgres EXCLUDE.
  // We don't double-check here because the DB is the source of truth.

  return v.length === 0 ? { ok: true } : { ok: false, violations: v };
}

// ---------------------------------------------------------------------------
// Sub-checks (also useful in isolation for the calendar grid)
// ---------------------------------------------------------------------------

export function isWithinClubHours(
  slot: { startsAt: Date; endsAt: Date },
  settings: Pick<BookingSettings, "opensAtLocalTime" | "closesAtLocalTime">,
): boolean {
  const opens = timeToHourMinute(settings.opensAtLocalTime);
  const closes = timeToHourMinute(settings.closesAtLocalTime);

  const day = parseLocalDate(formatLocalDate(slot.startsAt));
  const opensAtUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    opens.hour,
    opens.minute,
  );
  const closesAtUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    closes.hour,
    closes.minute,
  );
  return slot.startsAt >= opensAtUtc && slot.endsAt <= closesAtUtc;
}

export function startTimeMatches(
  startsAt: Date,
  constraint: "any" | "on_the_hour" | "on_the_half_hour",
): boolean {
  // Constraint applies in local time, but minutes-modulo are equal in any
  // timezone, so this is safe to compute in UTC.
  const minutes = startsAt.getUTCMinutes();
  switch (constraint) {
    case "any":
      return true;
    case "on_the_hour":
      return minutes === 0;
    case "on_the_half_hour":
      return minutes === 0 || minutes === 30;
  }
}

/**
 * Does an active recurring block actually apply on this slot's local date+time?
 *
 * The optional `viewerRole` lets coach/admin contexts skip `members_only`
 * blocks (those only restrict members from booking; coaches/admins can still
 * use the court — e.g. Kids Actief reserving courts 1-4 from members 14-18
 * while a coach gives a private lesson on court 3 during that same window).
 */
export function recurringBlockHits(
  slot: { startsAt: Date; endsAt: Date; courtId: string },
  block: Pick<
    RecurringBlock,
    | "courtId"
    | "dayOfWeek"
    | "startTime"
    | "endTime"
    | "startsOn"
    | "endsOn"
    | "excludedDates"
    | "status"
    | "scope"
  >,
  viewerRole?: BookerRole,
): boolean {
  if (block.status !== "active") return false;
  if (block.courtId !== slot.courtId) return false;
  if (
    block.scope === "members_only" &&
    viewerRole &&
    viewerRole !== "member"
  ) {
    return false;
  }

  const day = parseLocalDate(formatLocalDate(slot.startsAt));
  const slotDateMs = Date.UTC(day.year, day.month - 1, day.day);
  const startsOnMs = Date.UTC(
    block.startsOn.getUTCFullYear(),
    block.startsOn.getUTCMonth(),
    block.startsOn.getUTCDate(),
  );
  const endsOnMs = Date.UTC(
    block.endsOn.getUTCFullYear(),
    block.endsOn.getUTCMonth(),
    block.endsOn.getUTCDate(),
  );
  if (slotDateMs < startsOnMs || slotDateMs > endsOnMs) return false;

  for (const ex of block.excludedDates) {
    const exMs = Date.UTC(
      ex.getUTCFullYear(),
      ex.getUTCMonth(),
      ex.getUTCDate(),
    );
    if (exMs === slotDateMs) return false;
  }

  if (block.dayOfWeek) {
    const dayIdx = amsterdamDayOfWeek(slot.startsAt);
    const dowMap: Record<string, number> = {
      mon: 0,
      tue: 1,
      wed: 2,
      thu: 3,
      fri: 4,
      sat: 5,
      sun: 6,
    };
    if (dowMap[block.dayOfWeek] !== dayIdx) return false;
  }

  // Time overlap: convert block start/end (TIME) to UTC anchors on slot's date.
  const bStart = timeToHourMinute(block.startTime);
  const bEnd = timeToHourMinute(block.endTime);
  const blockStartUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    bStart.hour,
    bStart.minute,
  );
  const blockEndUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    bEnd.hour,
    bEnd.minute,
  );
  return slot.startsAt < blockEndUtc && slot.endsAt > blockStartUtc;
}

// ---------------------------------------------------------------------------
// Cancellation rules
// ---------------------------------------------------------------------------

/**
 * Can this user immediately cancel a booking?
 *  - Admin: yes, always (will set status='cancelled' + audit fields).
 *  - Member: yes for their own personal booking, IF strictly more than
 *    `cancellation_offset_minutes` before start.
 *  - Coach (personal booking): same as member.
 *  - Coach (coaching booking): no — must use requestCancellation flow.
 */
export function canCancelImmediately(args: {
  booker: Booker;
  booking: Pick<
    CourtBooking,
    | "bookedByPersonId"
    | "bookedByHouseholdId"
    | "purpose"
    | "startsAt"
    | "status"
  >;
  settings: Pick<BookingSettings, "cancellationOffsetMinutes">;
  now: Date;
  terms?: Terms;
}): RuleResult {
  const { booker, booking, settings, now } = args;
  const t = args.terms ?? DEFAULT_TERMS;
  const v: RuleViolation[] = [];

  if (booking.status !== "confirmed") {
    v.push({
      code: "outside_booking_window",
      message: `Only confirmed bookings can be cancelled.`,
    });
    return { ok: false, violations: v };
  }

  if (booker.role === "admin") return { ok: true };

  // Owner check (a parent in a household can cancel a child's booking).
  // Guard against null===null collapsing into a false positive once
  // bookedByHouseholdId is nullable (coach/admin coaching bookings).
  const owns =
    booking.bookedByPersonId === booker.personId ||
    (booking.bookedByHouseholdId !== null &&
      booker.householdId !== null &&
      booking.bookedByHouseholdId === booker.householdId);
  if (!owns) {
    v.push({
      code: "outside_booking_window",
      message: `You can only cancel your own bookings.`,
    });
    return { ok: false, violations: v };
  }

  if (booker.role === "coach" && booking.purpose === "coaching") {
    v.push({
      code: "outside_booking_window",
      message: `${t.privateLesson.singular} bookings require a deletion request and admin approval.`,
    });
    return { ok: false, violations: v };
  }

  const cutoff = new Date(
    booking.startsAt.getTime() - settings.cancellationOffsetMinutes * 60_000,
  );
  if (now > cutoff) {
    v.push({
      code: "outside_booking_window",
      message: `Bookings must be cancelled at least ${settings.cancellationOffsetMinutes} minutes before start.`,
    });
    return { ok: false, violations: v };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Stringify the set of violations into a single human-readable line. */
export function violationsToMessage(violations: RuleViolation[]): string {
  return violations.map((v) => v.message).join(" ");
}

/** Calendar slot status for the rendered grid. */
export type SlotState =
  | { kind: "free" }
  | { kind: "outside_hours" }
  | { kind: "booked"; bookingId: string; status: CourtBookingStatus; label: string }
  | { kind: "class"; classSessionId: string; label: string }
  | { kind: "recurring_block"; recurringBlockId: string; label: string }
  | { kind: "walk_on_only" };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatHHMM(t: Date): string {
  return formatLocalHour(t);
}

function labelStartConstraint(c: string): string {
  switch (c) {
    case "on_the_hour":
      return "on the hour (e.g. 09:00, 10:00)";
    case "on_the_half_hour":
      return "on the hour or half-hour (e.g. 09:00, 09:30)";
    default:
      return "any time";
  }
}
