/**
 * Single source of truth for "is this person covered by an active
 * membership at this club?".
 *
 * Used by every surface that gates on or prices off membership:
 *   - Enrollment server actions + the series detail page
 *   - Court booking server actions + booking rule checks
 *   - Adult ladder eligibility
 *   - Portal layout / nav badge / programs page
 *
 * Rules baked in here once, intentionally:
 *
 *   1. **Active.** `status = 'active'` AND `startsOn <= asOf <= expiresOn`.
 *      No more "any active row" without a date check — an expired row
 *      is not coverage.
 *
 *   2. **Family.** A family-tier membership covers every household
 *      member at every club it lists. (`assignedPersonId` is ignored
 *      for family rows by convention; we set it null in writes.)
 *
 *   3. **Individual (adult / child).** Covers exactly one person —
 *      the one in `assignedPersonId`. Rows with `assignedPersonId =
 *      null` cover nobody. (The old "null adult covers any adult"
 *      shortcut from `ladder/eligibility.ts` is gone — every grant
 *      now writes the assignee, see `grantEnrollmentMembership` and
 *      `createMembership`.)
 *
 *   4. **Clubs whitelist.** Coverage is keyed by club slug, restricted
 *      to the slugs configured in the active pricing config (today:
 *      `triaz` / `randwijck`). Other clubs are intentionally ignored.
 */

import { prisma } from "@/lib/prisma";
import type { MembershipCoverageTier } from "@prisma/client";
import { listConfiguredClubSlugs } from "@/lib/pricing/config";

export type ClubSlug = "triaz" | "randwijck";

export interface CoverageEntry {
  membershipId: string;
  tier: MembershipCoverageTier;
}

export interface Coverage {
  /** True when `personId` has at least one active membership covering `clubSlug`. */
  has(personId: string, clubSlug: ClubSlug): boolean;
  /** Every (clubSlug, tier, membershipId) triple covering `personId`. */
  forPerson(
    personId: string,
  ): Array<{ clubSlug: ClubSlug; tier: MembershipCoverageTier; membershipId: string }>;
  /** All slugs `personId` is covered at, deduplicated. */
  clubsForPerson(personId: string): ClubSlug[];
  /** True if `personId` is covered at any whitelisted club. */
  anyForPerson(personId: string): boolean;
}

export interface GetCoverageInput {
  /** Household to look up memberships for. `null` means no household → empty coverage. */
  householdId: string | null;
  /** Persons to evaluate coverage for. Empty array → empty coverage. */
  candidatePersonIds: string[];
  /** Reference time for "in date". Defaults to now. */
  asOf?: Date;
}

/**
 * The set of club slugs this org actually sells memberships for. Derived
 * from `listConfiguredClubSlugs()` so a future tenant (or a rename) only
 * has to edit the pricing config, not every coverage-query call site.
 * `ClubSlug` stays the Higgins-narrowed compile-time union; the runtime
 * list is config-driven.
 */
const WHITELISTED_SLUGS: readonly ClubSlug[] =
  listConfiguredClubSlugs() as readonly ClubSlug[];

function isClubSlug(slug: string): slug is ClubSlug {
  return (WHITELISTED_SLUGS as readonly string[]).includes(slug);
}

function makeKey(personId: string, clubSlug: ClubSlug): string {
  return `${personId}::${clubSlug}`;
}

/**
 * Load active membership coverage for a household and project it down
 * to a per-(person, club) lookup.
 */
export async function getActiveMembershipCoverage(
  input: GetCoverageInput,
): Promise<Coverage> {
  const asOf = input.asOf ?? new Date();
  const personIds = input.candidatePersonIds;
  const empty = buildCoverage(new Map());
  if (!input.householdId || personIds.length === 0) return empty;

  const memberships = await prisma.membership.findMany({
    where: {
      householdId: input.householdId,
      status: "active",
      startsOn: { lte: asOf },
      expiresOn: { gte: asOf },
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

  const map = new Map<string, CoverageEntry>();

  for (const m of memberships) {
    const slugs = m.membershipClubs
      .map((mc) => mc.club.slug.toLowerCase())
      .filter(isClubSlug);
    if (slugs.length === 0) continue;

    if (m.coverageTier === "family") {
      for (const personId of personIds) {
        for (const slug of slugs) {
          map.set(makeKey(personId, slug), {
            membershipId: m.id,
            tier: m.coverageTier,
          });
        }
      }
      continue;
    }

    if (m.assignedPersonId && personIds.includes(m.assignedPersonId)) {
      for (const slug of slugs) {
        map.set(makeKey(m.assignedPersonId, slug), {
          membershipId: m.id,
          tier: m.coverageTier,
        });
      }
    }
  }

  return buildCoverage(map);
}

function buildCoverage(map: Map<string, CoverageEntry>): Coverage {
  return {
    has(personId, clubSlug) {
      return map.has(makeKey(personId, clubSlug));
    },
    forPerson(personId) {
      const out: Array<{
        clubSlug: ClubSlug;
        tier: MembershipCoverageTier;
        membershipId: string;
      }> = [];
      for (const slug of WHITELISTED_SLUGS) {
        const entry = map.get(makeKey(personId, slug));
        if (entry) {
          out.push({
            clubSlug: slug,
            tier: entry.tier,
            membershipId: entry.membershipId,
          });
        }
      }
      return out;
    },
    clubsForPerson(personId) {
      const out: ClubSlug[] = [];
      for (const slug of WHITELISTED_SLUGS) {
        if (map.has(makeKey(personId, slug))) out.push(slug);
      }
      return out;
    },
    anyForPerson(personId) {
      for (const slug of WHITELISTED_SLUGS) {
        if (map.has(makeKey(personId, slug))) return true;
      }
      return false;
    },
  };
}

/**
 * Cheap "does this household have ANY active coverage at all, right now?"
 * probe. Used by the portal nav to gate whether to surface members-only
 * sections (e.g. court booking) without having to materialise the full
 * per-(person, club) projection.
 *
 * Like `personIsCovered`, this honours the same date window and
 * whitelisted-club rules as `getActiveMembershipCoverage` — so a row
 * with `status = 'active'` that's outside its `[startsOn, expiresOn]`
 * window or only attached to a non-whitelisted club does not count.
 */
export async function householdHasAnyCoverage(
  householdId: string | null,
  asOf: Date = new Date(),
): Promise<boolean> {
  if (!householdId) return false;
  const count = await prisma.membership.count({
    where: {
      householdId,
      status: "active",
      startsOn: { lte: asOf },
      expiresOn: { gte: asOf },
      membershipClubs: {
        some: { club: { slug: { in: [...WHITELISTED_SLUGS] } } },
      },
    },
  });
  return count > 0;
}

/**
 * Cheap "is this person covered at this club, right now?" probe.
 *
 * Equivalent to a one-person `getActiveMembershipCoverage().has(...)`
 * call. Useful inside a transaction where we don't need the full
 * household projection.
 */
export async function personIsCovered(
  args: {
    householdId: string | null;
    personId: string;
    clubSlug: ClubSlug;
    asOf?: Date;
  },
  tx?: PrismaTxOrClient,
): Promise<boolean> {
  if (!args.householdId) return false;
  const asOf = args.asOf ?? new Date();
  const client = tx ?? prisma;
  const count = await client.membership.count({
    where: {
      householdId: args.householdId,
      status: "active",
      startsOn: { lte: asOf },
      expiresOn: { gte: asOf },
      OR: [
        { coverageTier: "family" },
        {
          coverageTier: { in: ["adult", "child"] },
          assignedPersonId: args.personId,
        },
      ],
      membershipClubs: { some: { club: { slug: args.clubSlug } } },
    },
  });
  return count > 0;
}

/** Minimum surface we need from either `prisma` or a `$transaction` callback. */
export type PrismaTxOrClient = {
  membership: { count: typeof prisma.membership.count };
};
