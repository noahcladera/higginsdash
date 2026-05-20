/**
 * Membership absorption rules.
 *
 * Whenever a new membership is granted (direct purchase, upgrade,
 * enrollment-checkout grant), we look for older active memberships in
 * the same household whose coverage is fully shadowed by the new one
 * and flip them to `cancelled`. This guarantees a household never
 * carries two active rows that overlap in scope.
 *
 * "Fully shadowed" means: every (person × club) pair the older row
 * covers is also covered by the new row. Concretely:
 *
 *   - Buying a two-club family cancels every individual row in the
 *     household (any tier, any club within {triaz, randwijck}).
 *   - Buying a single-club family cancels every individual row in the
 *     household at THAT club.
 *   - Buying a Triaz adult assigned to person P cancels any pre-existing
 *     Triaz adult/child rows assigned to that same person. (Doesn't
 *     touch family rows — they cover more, not less.)
 *   - Adding the second club to an existing single-club individual row
 *     (handled by `upgradeMembership`) cancels the old single-club row.
 *
 * Implementation uses a simple per-(person × club) coverage projection
 * because the rules are easier to reason about as set inclusion than
 * as nested branching.
 */

import type { Prisma, PrismaClient, MembershipCoverageTier } from "@prisma/client";

export interface NewMembershipShape {
  /** UUID of the membership row that was just created. Excluded from the search. */
  id: string;
  householdId: string;
  coverageTier: MembershipCoverageTier;
  /** Lowercase club slugs this row covers. Whitelisted callers ensure {triaz, randwijck}. */
  clubSlugs: string[];
  /** Required for individual rows so we know which person it covers. Null for family. */
  assignedPersonId: string | null;
}

type TxClient = Prisma.TransactionClient | PrismaClient;

/**
 * Cancel any active memberships in the same household that the newly
 * created `target` fully shadows. Returns the ids of cancelled rows
 * so the caller can log / audit.
 *
 * Safe to call after the new membership has been inserted — the new
 * row is excluded by id.
 */
export async function absorbShadowedMemberships(
  tx: TxClient,
  target: NewMembershipShape,
): Promise<string[]> {
  if (target.clubSlugs.length === 0) return [];

  const targetClubs = new Set(target.clubSlugs.map((s) => s.toLowerCase()));

  const others = await tx.membership.findMany({
    where: {
      householdId: target.householdId,
      status: "active",
      id: { not: target.id },
    },
    select: {
      id: true,
      coverageTier: true,
      assignedPersonId: true,
      membershipClubs: {
        select: { club: { select: { slug: true } } },
      },
    },
  });

  const toCancel: string[] = [];
  for (const m of others) {
    if (isShadowedBy(m, target, targetClubs)) toCancel.push(m.id);
  }

  if (toCancel.length === 0) return [];

  await tx.membership.updateMany({
    where: { id: { in: toCancel }, status: "active" },
    data: { status: "cancelled" },
  });

  return toCancel;
}

function isShadowedBy(
  candidate: {
    id: string;
    coverageTier: MembershipCoverageTier;
    assignedPersonId: string | null;
    membershipClubs: { club: { slug: string } }[];
  },
  target: NewMembershipShape,
  targetClubs: Set<string>,
): boolean {
  const candidateClubs = candidate.membershipClubs.map((mc) =>
    mc.club.slug.toLowerCase(),
  );
  if (candidateClubs.length === 0) return false;

  // The new row must cover every club the old one covers, otherwise
  // we'd be silently dropping coverage.
  if (!candidateClubs.every((slug) => targetClubs.has(slug))) return false;

  if (target.coverageTier === "family") {
    // Family covers everyone in the household — anything individual or
    // family at a subset of clubs is shadowed.
    return true;
  }

  // Target is an individual row → can only shadow other individual rows
  // for the same assignee. (Never shadows a family row: family covers
  // more, not less.)
  if (candidate.coverageTier === "family") return false;
  if (!target.assignedPersonId) return false;
  return candidate.assignedPersonId === target.assignedPersonId;
}
