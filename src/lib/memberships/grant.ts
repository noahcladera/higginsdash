/**
 * Grant a single-club individual membership as part of an enrollment
 * checkout.
 *
 * The series detail page bundles the (non-member) membership add-on
 * into the same Mollie payment as the lesson itself. Once the payment
 * confirms, this helper writes the actual `Membership` row so the
 * student gets what they paid for. The new row:
 *
 *   - covers a single club (the venue's club) — joint coverage is a
 *     deliberate `/portal/membership` upsell, not a checkout-time
 *     decision;
 *   - is assigned to the student being enrolled (so the parent paying
 *     for their kid sees the kid get the membership, not themselves);
 *   - starts today and runs one calendar year — the same shape the
 *     office uses when granting a manual membership;
 *   - cancels any older shadowed rows in the household via
 *     {@link absorbShadowedMemberships}.
 *
 * Idempotency. The caller (enrollment-actions) checks
 * {@link personIsCovered} first; if there's already coverage at the
 * venue's club, no grant happens and no money is taken twice. The
 * helper itself doesn't re-check — by the time we reach it, the caller
 * has decided a grant is owed.
 */

import { Prisma, type MembershipCoverageTier } from "@prisma/client";
import { absorbShadowedMemberships } from "./absorb";
import { newMembershipEndsOn } from "@/lib/membership-seasons";
import type { ClubSlug } from "@/lib/pricing";

type TxClient = Prisma.TransactionClient;

export interface GrantEnrollmentMembershipArgs {
  studentPersonId: string;
  householdId: string;
  /** Club id to grant coverage for. */
  venueClubId: string;
  /** Lowercase slug of the venue's club; must be `triaz` or `randwijck`. */
  venueClubSlug: ClubSlug;
  ageBracket: "adult" | "child";
  /** Amount the parent paid as the membership add-on, in EUR. */
  pricePaid: number;
  /** When the parent paid. Defaults to now. */
  paidAt?: Date;
  /** Reference time for season math + start date. Defaults to today. */
  asOf?: Date;
}

export interface GrantedMembership {
  id: string;
  coverageTier: MembershipCoverageTier;
  /** Ids of older memberships that got cancelled because the new row shadows them. */
  cancelledShadowedIds: string[];
}

export async function grantEnrollmentMembership(
  tx: TxClient,
  args: GrantEnrollmentMembershipArgs,
): Promise<GrantedMembership> {
  const coverageTier: MembershipCoverageTier =
    args.ageBracket === "child" ? "child" : "adult";
  const startsOn = startOfDayUtc(args.asOf ?? new Date());
  const expiresOn = newMembershipEndsOn({
    clubs: [args.venueClubSlug],
    date: startsOn,
  });

  const created = await tx.membership.create({
    data: {
      householdId: args.householdId,
      assignedPersonId: args.studentPersonId,
      coverageTier,
      status: "active",
      startsOn,
      expiresOn,
      pricePaid: new Prisma.Decimal(args.pricePaid),
      paidAt: args.paidAt ?? new Date(),
      membershipClubs: {
        create: [{ clubId: args.venueClubId }],
      },
    },
    select: { id: true, coverageTier: true },
  });

  const cancelledShadowedIds = await absorbShadowedMemberships(tx, {
    id: created.id,
    householdId: args.householdId,
    coverageTier: created.coverageTier,
    clubSlugs: [args.venueClubSlug],
    assignedPersonId: args.studentPersonId,
  });

  return {
    id: created.id,
    coverageTier: created.coverageTier,
    cancelledShadowedIds,
  };
}

function startOfDayUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
