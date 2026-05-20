"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import { isGuardianOf } from "@/lib/portal/queries";
import {
  eventHasMemberPricingTier,
  parsePricingTiers,
  resolveEventCheckoutPrice,
} from "@/lib/classes/pricing-tiers";
import {
  ageBracketFromAge,
  computeEnrollmentPricing,
  type EnrollmentPricingBreakdown,
} from "@/lib/portal/enrollment-pricing";
import {
  getActiveMembershipCoverage,
  personIsCovered,
  type ClubSlug,
} from "@/lib/memberships/coverage";
import { grantEnrollmentMembership } from "@/lib/memberships/grant";
import { isReturningHousehold as isReturningHouseholdHelper } from "@/lib/memberships/returning";
import { notify, primaryEmailOf } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { withSerializableRetry } from "@/lib/db/serializable";
import { spendHouseholdCredit } from "@/lib/credits";

/**
 * Self-enrollment + withdrawal server actions for the parent portal.
 *
 * Both actions are idempotent and refuse to do anything destructive
 * cross-household. The parent rules:
 *
 *   - You can enroll yourself (if you're a Student) into any
 *     portal-visible series.
 *   - You can enroll your own children (where you're an `adult`
 *     household member and the child is a `child` of the same
 *     household). The child's `Student` row is auto-created if missing
 *     so the parent doesn't have to wait for the office.
 *   - You can withdraw an enrollment you (or your household) own. Only
 *     `active` / `pending_payment` / `waitlist` rows are withdrawable —
 *     `withdrawn` / `completed` are no-ops.
 *
 * Paid enrollment flow. The series page bundles lesson + (optional)
 * membership add-on into a single Mollie payment. After the payment
 * confirms, `runDemoCheckout` re-enters this action with a
 * `paymentContext` that:
 *
 *   - flips the enrollment status to `active`,
 *   - records a `Payment` row,
 *   - grants the membership add-on (one Membership + MembershipClub
 *     row, assigned to the student) when the parent paid for one,
 *   - links both the enrollment and the (optional) membership to the
 *     same payment via `PaymentLine` rows.
 *
 * Unpaid flows (waitlist, free, internal admin enroll) leave
 * `paymentContext` undefined and behave exactly as before.
 */

const CreateInput = z.object({
  classSeriesId: z.string().uuid(),
  studentPersonId: z.string().uuid(),
  /** Required when the series has more than one sub-group. */
  groupId: z.string().uuid().optional(),
  /**
   * Set when the parent acknowledged "my child is outside the age band
   * but I want to enroll anyway". Bypasses the age range check and
   * marks the resulting row `requiresReview = true` so the office can
   * confirm with the family before the lesson starts.
   */
  ageOverrideAck: z.boolean().optional(),
});
const WithdrawInput = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().trim().max(400).optional(),
});

export type EnrollResult =
  | {
      ok: true;
      enrollmentId: string;
      status: "pending_payment" | "waitlist" | "active";
      isNew: boolean;
      /**
       * Set when this call also finalized a paid enrollment (i.e.
       * the demo Mollie dispatcher passed a `paymentContext`). The
       * portal uses it to deep-link the post-checkout success banner
       * straight at the matching row in /portal/payments.
       */
      paymentId: string | null;
    }
  | { ok: false; error: string };

export type WithdrawResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; error: string };

/**
 * Optional second arg the demo Mollie dispatcher passes after the user
 * confirms payment. Presence of this object means "the parent has paid
 * for this enrollment — finalize the row".
 *
 * Discriminated union covers the two checkout flows:
 *
 *   - `kind: "lesson_plus_membership"` — legacy single-payment flow,
 *     where the bundled total covers both the lesson seat and a
 *     freshly-granted membership add-on. Kept for backwards-compat
 *     with the demo flow during migration to the two-step UX.
 *   - `kind: "lesson_only"` — new two-step flow. The membership was
 *     paid separately in step 1 (its own Payment row) and step 2 just
 *     bills the lesson. The server requires an existing covering
 *     membership to be present and writes a single Payment for the
 *     lesson; it does NOT call `grantEnrollmentMembership`.
 */
export type EnrollmentPaymentContext =
  | {
      kind: "lesson_plus_membership";
      /** Total EUR the parent paid (lesson + membership add-on combined). */
      amountPaid: number;
      paidAt?: Date;
      /**
       * EUR cents of household credit applied against the lesson seat
       * before the Mollie charge. Membership add-on never accepts
       * credit (lessons-only policy). Defaults to 0.
       */
      creditCentsApplied?: number;
    }
  | {
      kind: "lesson_only";
      /** EUR for the lesson seat only. */
      amountPaid: number;
      paidAt?: Date;
      /** EUR cents of household credit applied against the lesson seat. */
      creditCentsApplied?: number;
    };

export async function createEnrollment(
  input: {
    classSeriesId: string;
    studentPersonId: string;
    groupId?: string;
    ageOverrideAck?: boolean;
  },
  paymentContext?: EnrollmentPaymentContext,
): Promise<EnrollResult> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid enrollment request." };
  }
  const { classSeriesId, studentPersonId, ageOverrideAck } = parsed.data;
  let { groupId } = parsed.data;

  const { person } = await requireMember();

  const allowed =
    studentPersonId === person.id ||
    (await isGuardianOf(person.id, studentPersonId));
  if (!allowed) {
    return {
      ok: false,
      error: "You can only enroll yourself or your own children.",
    };
  }

  const series = await prisma.classSeries.findUnique({
    where: { id: classSeriesId },
    select: {
      id: true,
      status: true,
      visibility: true,
      archivedAt: true,
      maxStudents: true,
      waitlistEnabled: true,
      enrollmentOpensAt: true,
      enrollmentClosesAt: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      pricePerSeries: true,
      classType: true,
      pricingTiers: true,
      venue: {
        select: { club: { select: { id: true, slug: true } } },
      },
      sessions: {
        where: { status: { not: "cancelled" } },
        select: { startsAt: true },
      },
      groups: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
          maxStudents: true,
        },
      },
    },
  });
  if (!series || series.archivedAt) {
    return { ok: false, error: "That class isn't available right now." };
  }
  if (series.status !== "published") {
    return { ok: false, error: "That class isn't open for enrollment yet." };
  }
  if (
    series.visibility !== "public" &&
    series.visibility !== "members_only"
  ) {
    return { ok: false, error: "That class isn't open for self-enrollment." };
  }
  const now = new Date();
  if (series.enrollmentOpensAt && series.enrollmentOpensAt > now) {
    return { ok: false, error: "Enrollment hasn't opened yet for this class." };
  }
  if (series.enrollmentClosesAt && series.enrollmentClosesAt < now) {
    return { ok: false, error: "Enrollment is closed for this class." };
  }

  // Make sure we have a Student row for the target — kids signed up
  // through the family page might not have one yet.
  const studentExisting = await prisma.student.findUnique({
    where: { personId: studentPersonId },
  });
  if (!studentExisting) {
    await prisma.student.create({ data: { personId: studentPersonId } });
  }

  // Resolve the chosen sub-group. Single-group series auto-pick; for
  // multi-group series the parent must indicate which band they're
  // signing up for so the office and the coach can read the roster
  // correctly.
  if (series.groups.length === 0) {
    return {
      ok: false,
      error: "This class has no sub-group on file. Contact the office.",
    };
  }
  if (!groupId && series.groups.length === 1) {
    groupId = series.groups[0].id;
  }
  if (!groupId) {
    return {
      ok: false,
      error: "Pick a sub-group before signing up.",
    };
  }
  const chosenGroup = series.groups.find((g) => g.id === groupId);
  if (!chosenGroup) {
    return {
      ok: false,
      error: "That sub-group isn't part of this class.",
    };
  }

  // Pre-flight age + level checks. Group-level constraints are
  // checked first (they're stricter); then the series-level fallback.
  const target = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: { dateOfBirth: true },
  });
  const age = ageFromDob(target?.dateOfBirth ?? null);
  let ageOverrideReason: string | null = null;
  if (age != null) {
    const groupBand = formatAgeBand(chosenGroup.minAge, chosenGroup.maxAge);
    const seriesBand = formatAgeBand(series.minAge, series.maxAge);
    const outsideGroup =
      (chosenGroup.minAge != null && age < chosenGroup.minAge) ||
      (chosenGroup.maxAge != null && age > chosenGroup.maxAge);
    const outsideSeries =
      (series.minAge != null && age < series.minAge) ||
      (series.maxAge != null && age > series.maxAge);

    if ((outsideGroup || outsideSeries) && !ageOverrideAck) {
      if (chosenGroup.minAge != null && age < chosenGroup.minAge) {
        return {
          ok: false,
          error: `${chosenGroup.name} is for ages ${chosenGroup.minAge}+ — too young for this student.`,
        };
      }
      if (chosenGroup.maxAge != null && age > chosenGroup.maxAge) {
        return {
          ok: false,
          error: `${chosenGroup.name} is for up to age ${chosenGroup.maxAge} — too old for this student.`,
        };
      }
      if (series.minAge != null && age < series.minAge) {
        return {
          ok: false,
          error: `That class is for ages ${series.minAge}+ — too young for this student.`,
        };
      }
      if (series.maxAge != null && age > series.maxAge) {
        return {
          ok: false,
          error: `That class is for up to age ${series.maxAge} — too old for this student.`,
        };
      }
    }
    if ((outsideGroup || outsideSeries) && ageOverrideAck) {
      // Hard cap how far outside the band we'll accept — anything more
      // than 2 years outside almost certainly indicates a mis-pick and
      // we want the parent to talk to us first.
      const minBound = Math.min(
        chosenGroup.minAge ?? series.minAge ?? age,
        series.minAge ?? chosenGroup.minAge ?? age,
      );
      const maxBound = Math.max(
        chosenGroup.maxAge ?? series.maxAge ?? age,
        series.maxAge ?? chosenGroup.maxAge ?? age,
      );
      const distance =
        age < minBound
          ? minBound - age
          : age > maxBound
            ? age - maxBound
            : 0;
      if (distance > 2) {
        return {
          ok: false,
          error: `Age ${age} is too far outside the ${
            outsideGroup ? groupBand : seriesBand
          } band. Reach out to the office to set this up.`,
        };
      }
      ageOverrideReason = `age_override:${age}:${
        outsideGroup ? groupBand : seriesBand
      }`;
    }
  }

  // Snapshot the pricing math the parent saw at checkout. We never
  // trust client-supplied numbers — recompute from the same series +
  // sessions + membership coverage and persist what we got. Waitlist
  // rows skip persistence (see `breakdownForPersist`) because they're
  // not billable until they're promoted; the office reprices them at
  // promotion time.
  const targetPerson = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: {
      dateOfBirth: true,
      householdMember: { select: { householdId: true } },
    },
  });
  const candidateAgeBracket = ageBracketFromAge(
    ageFromDob(targetPerson?.dateOfBirth ?? null),
  );
  const venueClubSlugRaw = series.venue?.club?.slug.toLowerCase() ?? null;
  const venueClubSlug: ClubSlug | null =
    venueClubSlugRaw === "triaz" || venueClubSlugRaw === "randwijck"
      ? venueClubSlugRaw
      : null;
  const venueClubId = series.venue?.club?.id ?? null;
  const targetHouseholdId =
    targetPerson?.householdMember?.householdId ?? null;

  const coverage = await getActiveMembershipCoverage({
    householdId: targetHouseholdId,
    candidatePersonIds: [studentPersonId],
  });
  const hasActiveMembership =
    venueClubSlug != null && coverage.has(studentPersonId, venueClubSlug);
  const isReturningHousehold = await isReturningHouseholdHelper(targetHouseholdId);

  const pricingTiers = parsePricingTiers(series.pricingTiers);
  const isEvent = series.classType === "event";
  const checkoutPrice = isEvent
    ? resolveEventCheckoutPrice({
        pricePerSeries:
          series.pricePerSeries != null
            ? Number(series.pricePerSeries)
            : null,
        pricingTiers,
        hasActiveMembership,
      }).amountEur
    : series.pricePerSeries != null
      ? Number(series.pricePerSeries)
      : null;

  const breakdown = computeEnrollmentPricing({
    pricePerSeries: checkoutPrice,
    sessions: series.sessions,
    now,
    venueClubSlug,
    hasActiveMembership,
    candidateAgeBracket,
    isReturningHousehold,
    suppressMembershipAddOn:
      isEvent && eventHasMemberPricingTier(pricingTiers),
  });

  // Idempotency: surface the existing row instead of failing if the
  // parent double-clicks (`(classSeriesId, studentPersonId)` is unique).
  const existing = await prisma.enrollment.findUnique({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId,
        studentPersonId,
      },
    },
  });

  // Scratch flag — set when the existing row is `withdrawn` and we're
  // re-enrolling. Lets the post-existing-branch logic still grant a
  // membership/payment for paid retries.
  let reenrolledFromWithdrawnId: string | null = null;
  let reenrolledStatus: "pending_payment" | "waitlist" | null = null;

  if (existing) {
    if (existing.status === "withdrawn") {
      // Re-enroll: flip the row back rather than insert a fresh one
      // (keeps history and the unique constraint happy). Capacity
      // recount + update happens inside a Serializable txn (with
      // retry) so two parallel re-enrolls or one re-enroll racing a
      // fresh enroll cannot both land in `pending_payment` past
      // `maxStudents`.
      const allocation = await withSerializableRetry(async (tx) => {
        const liveCount = await tx.enrollment.count({
          where: {
            classSeriesId,
            status: { in: ["active", "pending_payment"] },
          },
        });
        const goesToWaitlist = liveCount >= series.maxStudents;
        const next = goesToWaitlist
          ? series.waitlistEnabled
            ? ("waitlist" as const)
            : null
          : ("pending_payment" as const);
        if (!next) {
          return { ok: false as const };
        }
        const persistFields = breakdownForPersist(breakdown, next);
        await tx.enrollment.update({
          where: { id: existing.id },
          data: {
            status: next,
            groupId,
            withdrawnOn: null,
            withdrawalReason: null,
            enrolledByPersonId: person.id,
            enrolledOn: new Date(),
            requiresReview: ageOverrideReason != null,
            reviewReason: ageOverrideReason,
            ...persistFields,
          },
        });
        return { ok: true as const, next };
      });
      if (!allocation.ok) {
        return {
          ok: false,
          error: "This class is full and the waitlist is closed.",
        };
      }
      reenrolledFromWithdrawnId = existing.id;
      reenrolledStatus = allocation.next;
    } else {
      // Live row already exists. If we have a paymentContext, treat
      // this as a checkout retry and finalize it (grant + payment),
      // unless the row is already paid for (`active`) or waitlisted.
      if (paymentContext) {
        const finalizeRes = await finalizePaidEnrollment({
          enrollmentId: existing.id,
          existingStatus: existing.status as
            | "pending_payment"
            | "waitlist"
            | "active",
          studentPersonId,
          householdId: targetHouseholdId,
          venueClubId,
          venueClubSlug,
          ageBracket: candidateAgeBracket,
          breakdown,
          payerPersonId: person.id,
          paymentContext,
          seriesPricePerSeries: series.pricePerSeries,
        });
        if (!finalizeRes.ok) return finalizeRes;
        revalidateAfterEnrollmentChange();
        return {
          ok: true,
          enrollmentId: existing.id,
          status: finalizeRes.status,
          isNew: false,
          paymentId: finalizeRes.paymentId,
        };
      }
      return {
        ok: true,
        enrollmentId: existing.id,
        status: existing.status as "pending_payment" | "waitlist" | "active",
        isNew: false,
        paymentId: null,
      };
    }
  }

  // ---- Fresh enrollment (no existing row, or existing row was withdrawn) ----

  // R1 (design/database.md): a covering membership is required to
  // enroll. We allow the row to be created without one ONLY when the
  // checkout will grant one in the same call (paymentContext + nonzero
  // membership add-on at the venue's club). Waitlist rows skip the
  // check entirely — they're not billable yet and the office reprices
  // at promotion time.
  let createdEnrollmentId: string;
  let createdStatus: "pending_payment" | "waitlist" | "active";

  if (reenrolledFromWithdrawnId && reenrolledStatus) {
    createdEnrollmentId = reenrolledFromWithdrawnId;
    createdStatus = reenrolledStatus;
  } else {
    // Capacity-aware seat allocation. Recount + insert run inside a
    // Serializable transaction (with retry on `40001`/`P2034`) so two
    // parallel enrolls cannot both observe `liveCount < maxStudents`
    // and both land in `pending_payment` past capacity. The R1
    // membership-coverage check stays *outside* the txn — it only
    // matters when the resolved status is `pending_payment`, and we
    // re-evaluate it after the txn returns the chosen status.
    const allocation = await withSerializableRetry(async (tx) => {
      const liveCount = await tx.enrollment.count({
        where: {
          classSeriesId,
          status: { in: ["active", "pending_payment"] },
        },
      });
      const goesToWaitlist = liveCount >= series.maxStudents;
      if (goesToWaitlist && !series.waitlistEnabled) {
        return { ok: false as const, reason: "full_no_waitlist" as const };
      }
      const initialStatus: "pending_payment" | "waitlist" = goesToWaitlist
        ? "waitlist"
        : "pending_payment";

      // R1 enforcement (skip for waitlist + when checkout will grant
      // one). Inside the txn so a parallel grantEnrollmentMembership
      // commit becomes visible if it lands first.
      //
      // The `lesson_only` checkout flavor will NOT grant a membership
      // (it's the second leg of the two-step UX where the membership
      // already got its own Payment in step 1) — so coverage must be
      // present here, otherwise we refuse and the parent has to go
      // pay the membership before the lesson seat can be saved.
      if (initialStatus === "pending_payment" && !hasActiveMembership) {
        const willGrantMembership =
          !!paymentContext &&
          paymentContext.kind === "lesson_plus_membership" &&
          venueClubSlug != null &&
          venueClubId != null &&
          breakdown.membershipAddOn != null &&
          breakdown.membershipAddOn > 0;
        if (!willGrantMembership) {
          return { ok: false as const, reason: "needs_membership" as const };
        }
      }

      const created = await tx.enrollment.create({
        data: {
          classSeriesId,
          groupId,
          studentPersonId,
          status: initialStatus,
          enrolledByPersonId: person.id,
          requiresReview: ageOverrideReason != null,
          reviewReason: ageOverrideReason,
          ...breakdownForPersist(breakdown, initialStatus),
        },
        select: { id: true, status: true },
      });
      return { ok: true as const, created };
    });

    if (!allocation.ok) {
      if (allocation.reason === "full_no_waitlist") {
        return {
          ok: false,
          error: "This class is full and the waitlist is closed.",
        };
      }
      return {
        ok: false,
        error:
          venueClubSlug == null
            ? "This series isn't tied to a club we sell memberships for. Contact the office to enroll."
            : `An active ${venueClubSlug === "triaz" ? "Triaz" : "Randwijck"} membership is required to enroll. Pay the ${venueClubSlug === "triaz" ? "Triaz" : "Randwijck"} membership in step 1, then return here to pay the lesson.`,
      };
    }

    createdEnrollmentId = allocation.created.id;
    createdStatus = allocation.created.status as
      | "pending_payment"
      | "waitlist"
      | "active";
  }

  // If the caller is the demo Mollie dispatcher (paymentContext set)
  // and this is a billable enrollment, finalize it now: flip status,
  // create Payment + lines, grant membership add-on if applicable.
  let createdPaymentId: string | null = null;
  if (paymentContext && createdStatus !== "waitlist") {
    const finalizeRes = await finalizePaidEnrollment({
      enrollmentId: createdEnrollmentId,
      existingStatus: createdStatus,
      studentPersonId,
      householdId: targetHouseholdId,
      venueClubId,
      venueClubSlug,
      ageBracket: candidateAgeBracket,
      breakdown,
      payerPersonId: person.id,
      paymentContext,
      seriesPricePerSeries: series.pricePerSeries,
    });
    if (!finalizeRes.ok) return finalizeRes;
    createdStatus = finalizeRes.status;
    createdPaymentId = finalizeRes.paymentId;
  }

  revalidateAfterEnrollmentChange();
  return {
    ok: true,
    enrollmentId: createdEnrollmentId,
    status: createdStatus,
    isNew: reenrolledFromWithdrawnId == null,
    paymentId: createdPaymentId,
  };
}

/**
 * Promote an enrollment to `active`, write a `Payment` row, grant the
 * membership add-on if the parent paid for one (and they aren't
 * already covered), and link everything via `PaymentLine` rows. All
 * inside a single transaction so a failure leaves no half-finished
 * state.
 *
 * Idempotent: if the enrollment is already `active` AND the student
 * is already covered at the venue's club, this is a no-op (and we
 * skip writing a duplicate payment).
 */
async function finalizePaidEnrollment(args: {
  enrollmentId: string;
  existingStatus: "pending_payment" | "waitlist" | "active";
  studentPersonId: string;
  householdId: string | null;
  venueClubId: string | null;
  venueClubSlug: ClubSlug | null;
  ageBracket: "adult" | "child";
  breakdown: EnrollmentPricingBreakdown;
  payerPersonId: string;
  paymentContext: EnrollmentPaymentContext;
  seriesPricePerSeries: Prisma.Decimal | null;
}): Promise<
  | { ok: true; status: "active"; paymentId: string | null; membershipId: string | null }
  | { ok: false; error: string }
> {
  // Already settled and covered → nothing to do.
  if (args.existingStatus === "active") {
    const owed =
      args.householdId != null &&
      args.venueClubSlug != null &&
      (args.breakdown.membershipAddOn ?? 0) > 0;
    if (!owed) {
      return { ok: true, status: "active", paymentId: null, membershipId: null };
    }
    // If the membership wasn't granted on the original try (rare —
    // would mean a partial transaction failure), we still want to
    // catch up. Fall through into the grant path with status already
    // active; we just skip the enrollment.update below.
  }

  return prisma.$transaction(async (tx) => {
    if (args.existingStatus !== "active") {
      await tx.enrollment.update({
        where: { id: args.enrollmentId },
        data: { status: "active" },
      });
    }

    // In the new two-step flow the membership has already been paid
    // (its own Payment row from `createMembership`), so we never grant
    // one here. This call is purely the lesson-seat half.
    const wantsMembership =
      args.paymentContext.kind === "lesson_plus_membership" &&
      args.householdId != null &&
      args.venueClubId != null &&
      args.venueClubSlug != null &&
      (args.breakdown.membershipAddOn ?? 0) > 0;

    let membershipId: string | null = null;
    let membershipAddOnPaid = 0;

    if (wantsMembership) {
      // Re-check coverage inside the transaction in case a parallel
      // grant landed first (double-tap / retry). If they're already
      // covered we don't grant a second row, but the parent paid the
      // bundled total — the office can refund manually if needed.
      // We still record the full payment so accounting matches the
      // bank statement. Uses the same `personIsCovered` primitive as
      // the rest of the app so coverage semantics match exactly.
      const alreadyCovered = await personIsCovered(
        {
          householdId: args.householdId,
          personId: args.studentPersonId,
          clubSlug: args.venueClubSlug!,
        },
        tx,
      );

      if (!alreadyCovered) {
        const granted = await grantEnrollmentMembership(tx, {
          studentPersonId: args.studentPersonId,
          householdId: args.householdId!,
          venueClubId: args.venueClubId!,
          venueClubSlug: args.venueClubSlug!,
          ageBracket: args.ageBracket,
          pricePaid: args.breakdown.membershipAddOn ?? 0,
          paidAt: args.paymentContext.paidAt,
        });
        membershipId = granted.id;
        membershipAddOnPaid = args.breakdown.membershipAddOn ?? 0;
      }
    }

    const totalAmount = new Prisma.Decimal(args.paymentContext.amountPaid);
    const lessonAmountFull = new Prisma.Decimal(
      args.breakdown.payableLesson ?? 0,
    );
    const membershipAmount = new Prisma.Decimal(membershipAddOnPaid);

    const description = membershipId
      ? "Class enrollment + membership add-on"
      : "Class enrollment";

    const payment = await tx.payment.create({
      data: {
        amount: totalAmount,
        currency: "EUR",
        status: "paid",
        description,
        paidByPersonId: args.payerPersonId,
        paidByHouseholdId: args.householdId,
        paidAt: args.paymentContext.paidAt ?? new Date(),
      },
      select: { id: true },
    });

    await tx.paymentLine.create({
      data: {
        paymentId: payment.id,
        amount: lessonAmountFull,
        description: "Class enrollment",
        enrollmentId: args.enrollmentId,
      },
    });

    if (membershipId) {
      await tx.paymentLine.create({
        data: {
          paymentId: payment.id,
          amount: membershipAmount,
          description: "Membership add-on (single club)",
          membershipId,
        },
      });
    }

    // Apply any household credit the buyer chose to spend on the
    // lesson seat. We write the negative ledger row + a matching
    // negative `PaymentLine(creditLedgerId=...)` so the sum of lines
    // reconciles to the cash actually charged via Mollie. Membership
    // never gets the credit treatment (lessons-only policy).
    const creditCentsApplied = Math.max(
      0,
      Math.floor(args.paymentContext.creditCentsApplied ?? 0),
    );
    if (creditCentsApplied > 0) {
      if (args.householdId == null) {
        throw new Error(
          "finalizePaidEnrollment: cannot apply credit without a household.",
        );
      }
      const lessonChargeCents = Math.round(
        (args.breakdown.payableLesson ?? 0) * 100,
      );
      const cappedCents = Math.min(creditCentsApplied, lessonChargeCents);
      const ledger = await spendHouseholdCredit(
        {
          householdId: args.householdId,
          enrollmentId: args.enrollmentId,
          amountCents: cappedCents,
          createdByPersonId: args.payerPersonId,
          relatedPaymentId: payment.id,
          note: "Applied at lesson checkout",
        },
        tx,
      );
      const creditLineAmount = new Prisma.Decimal(
        (-cappedCents / 100).toFixed(2),
      );
      await tx.paymentLine.create({
        data: {
          paymentId: payment.id,
          amount: creditLineAmount,
          description: "Household credit applied",
          creditLedgerId: ledger.creditId,
        },
      });
    }

    const enr = await tx.enrollment.findUniqueOrThrow({
      where: { id: args.enrollmentId },
      select: { classSeriesId: true },
    });
    return {
      ok: true,
      status: "active" as const,
      paymentId: payment.id,
      membershipId,
    };
  });
}

export async function withdrawEnrollment(input: {
  enrollmentId: string;
  reason?: string;
}): Promise<WithdrawResult> {
  const parsed = WithdrawInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid withdrawal request." };
  }
  const { enrollmentId, reason } = parsed.data;

  const { person } = await requireMember();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      classSeriesId: true,
      studentPersonId: true,
      pricePaid: true,
      student: {
        select: {
          person: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      classSeries: {
        select: {
          id: true,
          name: true,
          sessions: {
            select: { startsAt: true },
            orderBy: { startsAt: "asc" },
            take: 1,
          },
          coaches: { select: { coachPersonId: true } },
        },
      },
    },
  });
  if (!enrollment) {
    return { ok: false, error: "We couldn't find that enrollment." };
  }

  const owns =
    enrollment.studentPersonId === person.id ||
    (await isGuardianOf(person.id, enrollment.studentPersonId));
  if (!owns) {
    return {
      ok: false,
      error: "You can only withdraw your own family's enrollments.",
    };
  }

  if (
    enrollment.status !== "active" &&
    enrollment.status !== "pending_payment" &&
    enrollment.status !== "waitlist"
  ) {
    return { ok: true, enrollmentId };
  }

  const now = new Date();
  const beforeSnapshot = enrollment;
  const firstSessionStart = enrollment.classSeries.sessions[0]?.startsAt ?? null;
  const paid =
    enrollment.pricePaid != null && Number(enrollment.pricePaid) > 0;
  // Refund flag: if the parent paid AND withdrew before the first session
  // happened, surface it to admin. After the series has started we don't
  // even propose an automatic refund — that's a manual office decision.
  const flagForRefund =
    paid &&
    firstSessionStart != null &&
    firstSessionStart > now &&
    enrollment.status !== "waitlist";

  // Promote the oldest waitlisted student inside the same transaction.
  // Picking the head with `FOR UPDATE SKIP LOCKED` means two parallel
  // withdraws on the same series can't both grab the same waitlister:
  // the second txn skips the row the first txn has locked and either
  // promotes the next one in line or finds nothing.
  const promotion = await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "withdrawn",
        withdrawnOn: now,
        withdrawalReason: reason ?? null,
        refundRequestedAt: flagForRefund ? now : null,
        refundRequestedReason: flagForRefund
          ? reason ?? "Withdrawn before the series started while paid."
          : null,
      },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: enrollmentId,
      action: "update",
      changedByPersonId: person.id,
      before: beforeSnapshot,
      after: {
        status: "withdrawn",
        withdrawnOn: now.toISOString(),
        withdrawalReason: reason ?? null,
        refundRequestedAt: flagForRefund ? now.toISOString() : null,
      },
    });

    const heads = await tx.$queryRaw<
      { id: string; student_person_id: string }[]
    >`
      SELECT id, student_person_id
      FROM enrollments
      WHERE class_series_id = ${enrollment.classSeriesId}::uuid
        AND status = 'waitlist'
      ORDER BY enrolled_on ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const head = heads[0];
    if (!head) return { promotedId: null, promotedStudentPersonId: null };

    await tx.enrollment.update({
      where: { id: head.id },
      data: { status: "pending_payment" },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: head.id,
      action: "update",
      changedByPersonId: person.id,
      before: { status: "waitlist" },
      after: { status: "pending_payment", reason: "promoted_from_waitlist" },
    });
    return {
      promotedId: head.id,
      promotedStudentPersonId: head.student_person_id,
    };
  });

  // Load the promoted student's name + email outside the txn so the
  // notify() call doesn't extend the lock window.
  const promotedTarget = promotion.promotedId
    ? await prisma.enrollment.findUnique({
        where: { id: promotion.promotedId },
        select: {
          id: true,
          studentPersonId: true,
          student: {
            select: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  emails: {
                    where: { isPrimary: true, archivedAt: null },
                    select: { address: true, isPrimary: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  // Tell the series coaches that a student is gone, so they can plan
  // for the next session without checking the admin queue.
  const studentName = `${enrollment.student.person.firstName} ${enrollment.student.person.lastName}`.trim();
  const seriesName = enrollment.classSeries.name;
  const coachIds = enrollment.classSeries.coaches.map((c) => c.coachPersonId);
  if (coachIds.length > 0) {
    const coaches = await prisma.person.findMany({
      where: { id: { in: coachIds } },
      select: {
        id: true,
        emails: {
          where: { isPrimary: true, archivedAt: null },
          select: { address: true, isPrimary: true },
          take: 1,
        },
      },
    });
    await Promise.all(
      coaches.map((c) =>
        notify({
          recipientPersonId: c.id,
          recipientEmail: c.emails[0]?.address ?? null,
          channels: c.emails[0] ? ["in_app", "email"] : ["in_app"],
          templateKey: "enrollment.withdrawn.coach",
          subject: `${studentName} withdrew from ${seriesName}`,
          body: `${studentName} withdrew from ${seriesName}.${reason ? `\n\nReason: ${reason}` : ""}`,
          relatedTable: "enrollments",
          relatedRowId: enrollmentId,
        }),
      ),
    );
  }

  // Tell the promoted waitlister they got a seat (and need to pay).
  if (promotedTarget) {
    const promotedEmail = primaryEmailOf(promotedTarget.student.person);
    await notify({
      recipientPersonId: promotedTarget.student.person.id,
      recipientEmail: promotedEmail,
      channels: promotedEmail ? ["in_app", "email"] : ["in_app"],
      templateKey: "enrollment.waitlist.promoted",
      subject: `You're off the waitlist for ${seriesName}`,
      body: `Good news — a spot opened up in ${seriesName}. Head to the portal to confirm and pay.`,
      relatedTable: "enrollments",
      relatedRowId: promotedTarget.id,
    });
  }

  revalidateAfterEnrollmentChange();
  if (flagForRefund) {
    revalidatePath("/admin/inbox");
    revalidatePath("/admin/payments");
  }
  return { ok: true, enrollmentId };
}

async function countLiveEnrollments(classSeriesId: string): Promise<number> {
  return prisma.enrollment.count({
    where: {
      classSeriesId,
      status: { in: ["active", "pending_payment"] },
    },
  });
}

function revalidateAfterEnrollmentChange() {
  revalidatePath("/portal");
  revalidatePath("/portal/classes");
  revalidatePath("/portal/programs");
  revalidatePath("/portal/membership");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/book");
}

/**
 * Map a computed breakdown to the columns we persist on `enrollments`.
 * Waitlist rows leave every field null because they aren't billable
 * yet — promotion to `pending_payment` (handled by the office today;
 * future-work TODO to re-run pricing then) will re-fill them.
 */
function breakdownForPersist(
  breakdown: EnrollmentPricingBreakdown,
  status: "active" | "pending_payment" | "waitlist",
) {
  if (status === "waitlist") {
    return {
      pricePaid: null,
      priceMembershipAddOn: null,
      sessionsRemainingAtEnrollment: null,
    };
  }
  return {
    pricePaid: breakdown.payableLesson,
    priceMembershipAddOn: breakdown.membershipAddOn,
    sessionsRemainingAtEnrollment: breakdown.remainingSessions,
  };
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function formatAgeBand(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min != null && max != null) return `${min}-${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `<=${max}`;
  return "any";
}
