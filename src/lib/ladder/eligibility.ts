import { prisma } from "@/lib/prisma";
import { getActiveMembershipCoverage } from "@/lib/memberships/coverage";

/**
 * Adult-ladder eligibility helper.
 *
 * To play in the ladder you must currently hold a covering Triaz adult
 * membership AND be an adult member of your household. Per Heather's
 * 2026 directive the ladder is Triaz-only — Randwijck members get the
 * same gate as a non-member with a "ladder lives at Triaz" message.
 * Coverage comes from the shared `getActiveMembershipCoverage`
 * primitive — same rules used by enrollment, booking, and the portal
 * layout, so "is this person a member?" answers identically
 * everywhere.
 *
 * Children and households where the only memberships are child seats
 * are *not* eligible — they get the same `MembershipGate` upsell as a
 * non-member trying to book.
 *
 * The helper is used by:
 *   - `/portal/ladder/*` pages (rendered as a gate when ineligible).
 *   - all `src/lib/ladder/actions.ts` server actions (defense in depth so
 *     a hand-crafted POST can't bypass the UI).
 */
export type LadderClubSlug = "triaz";

export interface LadderEligibility {
  /** True iff the viewer can join / participate in the ladder right now. */
  eligible: boolean;
  /** Adult-eligible clubs the viewer is covered at. */
  clubs: { id: string; slug: LadderClubSlug; name: string }[];
  /**
   * Why the viewer can't join, when `eligible=false`. Used by the page to
   * choose copy (no household, no adult seat, child viewer, …).
   */
  reason?:
    | "no_household"
    | "no_membership"
    | "child_only"
    | "child_viewer";
}

export async function getLadderEligibility(args: {
  personId: string;
  householdId: string | null;
}): Promise<LadderEligibility> {
  const { personId, householdId } = args;

  if (!householdId) {
    return { eligible: false, clubs: [], reason: "no_household" };
  }

  // Establish whether the viewer is an adult in their household. A child
  // never gets ladder access, even if the family seat would technically
  // cover them.
  const member = await prisma.householdMember.findUnique({
    where: { personId },
    select: { roleInHousehold: true },
  });
  const viewerIsAdult = member?.roleInHousehold === "adult";
  if (!viewerIsAdult) {
    return { eligible: false, clubs: [], reason: "child_viewer" };
  }

  const coverage = await getActiveMembershipCoverage({
    householdId,
    candidatePersonIds: [personId],
  });

  const entries = coverage.forPerson(personId);
  // Child-tier coverage is irrelevant for the adult ladder. A child
  // assigned to an adult ladder slot would never happen here (the
  // viewer is verified adult above), but we still skip child-tier
  // rows to make the intent explicit.
  const adultEligibleEntries = entries.filter((e) => e.tier !== "child");

  if (adultEligibleEntries.length === 0) {
    // Distinguish "child-only memberships in the household" from "no
    // memberships at all" so the gate can pick the right copy.
    const anyHouseholdMembership = await prisma.membership.count({
      where: {
        householdId,
        status: "active",
        startsOn: { lte: new Date() },
        expiresOn: { gte: new Date() },
      },
    });
    return {
      eligible: false,
      clubs: [],
      reason: anyHouseholdMembership > 0 ? "child_only" : "no_membership",
    };
  }

  const clubRows = await prisma.club.findMany({
    where: {
      slug: { in: adultEligibleEntries.map((e) => e.clubSlug) },
    },
    select: { id: true, slug: true, name: true },
  });

  const clubs: { id: string; slug: LadderClubSlug; name: string }[] = [];
  for (const row of clubRows) {
    const slug = row.slug.toLowerCase();
    if (slug !== "triaz") continue;
    clubs.push({ id: row.id, slug, name: row.name });
  }

  if (clubs.length === 0) {
    return { eligible: false, clubs: [], reason: "no_membership" };
  }
  return { eligible: true, clubs };
}
