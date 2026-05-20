"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import {
  getHouseholdBuyContext,
  getMembershipsForHousehold,
} from "@/lib/portal/queries";
import {
  availabilityFor,
  availableUpgrades,
  keyDepositLine,
  priceForPurchase,
  randwijckBundleById,
  splitJointPrice,
  type ActiveMembershipSnapshot,
  type CellAvailability,
  type ClubSlug,
  type PricingContext,
  type RandwijckBundleId,
} from "@/lib/pricing";
import { isReturningHousehold } from "@/lib/memberships/returning";
import { getMollieAccountForMembership } from "@/lib/payments/mollie-accounts";
import {
  clubAvailableOn,
  newMembershipEndsOn,
  randwijckStatusOn,
  formatLongDate,
} from "@/lib/membership-seasons";
import { absorbShadowedMemberships } from "@/lib/memberships/absorb";
import { recordAudit } from "@/lib/audit";

const TierSchema = z.enum(["adult", "child", "family"]);
const ClubSchema = z.enum(["triaz", "randwijck"]);
const RandwijckBundleSchema = z.enum(["summer", "late_season"]);

const CreateInputSchema = z
  .object({
    tier: TierSchema,
    clubs: z.array(ClubSchema).min(1).max(2),
    assignedPersonId: z.string().uuid().optional(),
    /**
     * Joint-membership demo flow only. The first ("triaz") step is the
     * one that actually does the DB writes — it creates the Membership
     * row and both Triaz + Randwijck Payment rows in one transaction so
     * the joint coverage is atomic. The second ("randwijck") step is a
     * cosmetic Mollie-page render so the demo audience can see the
     * second Mollie account get charged; it returns ok without doing
     * any writes.
     *
     * Single-club purchases leave this `undefined` and write one
     * Payment as today.
     */
    step: z.enum(["triaz", "randwijck"]).optional(),
    /**
     * When set, the buyer chose a Randwijck flat-rate bundle instead of
     * the prorated single. Only valid for `tier: "adult"` and
     * `clubs: ["randwijck"]`. Pricing + expiresOn come from the bundle
     * definition rather than the per-month proration table.
     */
    randwijckBundle: RandwijckBundleSchema.optional(),
  })
  .refine(
    (val) => !(val.tier === "family" && val.clubs.includes("triaz")),
    {
      message: "Family memberships cover Randwijck only — pick Adult or Child for Triaz.",
      path: ["tier"],
    },
  )
  .refine(
    (val) =>
      !val.randwijckBundle ||
      (val.tier === "adult" &&
        val.clubs.length === 1 &&
        val.clubs[0] === "randwijck"),
    {
      message: "Randwijck seasonal passes are sold for adult Randwijck-only memberships.",
      path: ["randwijckBundle"],
    },
  );

const UpgradeInputSchema = z.object({
  offerId: z.string().min(1),
});

export type CreateMembershipResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpgradeMembershipResult =
  | { ok: true; netPrice: number }
  | { ok: false; error: string };

/**
 * Buy a membership directly (no upgrade credit). Used by the buy menu
 * for first purchases, additional kid memberships, etc.
 *
 * Pricing is recomputed server-side, so tampering with the form payload
 * can't undercharge.
 */
export async function createMembership(
  input: unknown,
): Promise<CreateMembershipResult> {
  try {
    const { person, householdId } = await requireMember();
    if (!householdId) {
      return {
        ok: false,
        error:
          "Your account isn't linked to a household yet. Refresh and try again — if this keeps happening, contact the office.",
      };
    }

    const parsed = CreateInputSchema.safeParse(input);
    if (!parsed.success) {
      const familyTriaz = parsed.error.issues.find(
        (i) => i.path[0] === "tier" && i.message.includes("Family"),
      );
      if (familyTriaz) return { ok: false, error: familyTriaz.message };
      const bundleErr = parsed.error.issues.find(
        (i) => i.path[0] === "randwijckBundle",
      );
      if (bundleErr) return { ok: false, error: bundleErr.message };
      return { ok: false, error: "Invalid coverage choice." };
    }
    const { tier, clubs: clubSlugsRaw, assignedPersonId, step, randwijckBundle } = parsed.data;

    if (step === "randwijck") {
      return { ok: true };
    }

    const clubSlugs = orderedUniqueClubs(clubSlugsRaw);
    const seasonError = ensureClubsInSeason(clubSlugs);
    if (seasonError) return { ok: false, error: seasonError };

    const clubRows = await prisma.club.findMany({
      where: { slug: { in: clubSlugs }, isActive: true, archivedAt: null },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, slug: true },
    });
    if (clubRows.length !== clubSlugs.length) {
      return {
        ok: false,
        error:
          "One of the selected clubs is unavailable right now. Refresh and try again.",
      };
    }

    const isReturning = await isReturningHousehold(householdId);
    const dateRange = freshDateRange({ clubs: clubSlugs, randwijckBundleId: randwijckBundle });
    const ctx: PricingContext = { joinDate: dateRange.startsOn, isReturning };

    const own = await getHouseholdBuyContext(householdId, person.id);
    const column = columnFromClubs(clubSlugs);
    const availability = availabilityFor(tier, column, own);
    if (
      availability.kind !== "unlocked" &&
      availability.kind !== "both_clubs_partial"
    ) {
      return {
        ok: false,
        error: "This membership is already covered by your household.",
      };
    }

    const resolvedClubs =
      availability.kind === "both_clubs_partial"
        ? [availability.missingClub]
        : clubSlugs;

    // Bundle is only valid as a single-club Randwijck purchase. If the
    // partial-availability collapse turned a "both" purchase into a
    // single Triaz add, drop the bundle (it doesn't apply).
    const effectiveBundle =
      randwijckBundle &&
      resolvedClubs.length === 1 &&
      resolvedClubs[0] === "randwijck"
        ? randwijckBundle
        : undefined;

    const bindingResult = validateBinding({
      tier,
      assignedPersonId,
      own,
      clubs: resolvedClubs,
      availability,
    });
    if (!bindingResult.ok) return { ok: false, error: bindingResult.error };

    // Compute pricing — bundles use their own flat rate, otherwise the
    // standard pricing engine (with proration / returning-member rules).
    const pricePaid = effectiveBundle
      ? priceForBundle(effectiveBundle)
      : priceForPurchase({ tier, clubs: resolvedClubs, ownership: own, ctx });

    const keyDeposit = keyDepositLine({
      tier,
      clubs: resolvedClubs,
      isReturning,
    });

    const rows = clubRows.filter((row) => resolvedClubs.includes(row.slug as ClubSlug));

    // Build the per-club payment plan. Joint memberships (both clubs)
    // get split into two Payment rows so each club's portion lands in
    // its own Mollie account; single-club purchases get one Payment.
    const isJoint = resolvedClubs.length === 2;
    const paymentPlan: {
      clubSlug: ClubSlug;
      amount: number;
      account: ReturnType<typeof getMollieAccountForMembership>;
      description: string;
    }[] = isJoint
      ? (() => {
          const split = splitJointPrice(tier, ctx);
          return [
            {
              clubSlug: "triaz" as const,
              amount: split.triazPortion,
              account: getMollieAccountForMembership({ clubSlug: "triaz" }),
              description: `${capitalizeTier(tier)} membership · Triaz portion (joint)`,
            },
            {
              clubSlug: "randwijck" as const,
              amount: split.randwijckPortion,
              account: getMollieAccountForMembership({ clubSlug: "randwijck" }),
              description: `${capitalizeTier(tier)} membership · Randwijck portion (joint, discount applied)`,
            },
          ];
        })()
      : [
          {
            clubSlug: resolvedClubs[0],
            amount: pricePaid,
            account: getMollieAccountForMembership({ clubSlug: resolvedClubs[0] }),
            description: effectiveBundle
              ? `${capitalizeTier(tier)} membership · Randwijck ${bundleLabelFor(effectiveBundle)}`
              : `${capitalizeTier(tier)} membership · ${resolvedClubs[0] === "triaz" ? "Triaz" : "Randwijck"}`,
          },
        ];

    // Add the key deposit line to the Triaz leg when billed.
    if (keyDeposit && keyDeposit.billed && keyDeposit.amount > 0) {
      const triazLeg = paymentPlan.find((p) => p.clubSlug === "triaz");
      if (triazLeg) {
        triazLeg.amount += keyDeposit.amount;
        triazLeg.description += ` · includes €${keyDeposit.notional} key deposit`;
      }
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.membership.create({
        data: {
          householdId,
          assignedPersonId: bindingResult.assignedPersonId,
          coverageTier: tier,
          status: "active",
          startsOn: dateRange.startsOn,
          expiresOn: dateRange.expiresOn,
          pricePaid: new Prisma.Decimal(pricePaid),
          paidAt: new Date(),
          membershipClubs: {
            create: rows.map((c) => ({ clubId: c.id })),
          },
        },
        select: { id: true },
      });
      await recordAudit({
        tx,
        tableName: "memberships",
        rowId: created.id,
        action: "insert",
        changedByPersonId: person.id,
        after: {
          householdId,
          assignedPersonId: bindingResult.assignedPersonId,
          coverageTier: tier,
          status: "active",
          startsOn: dateRange.startsOn.toISOString(),
          expiresOn: dateRange.expiresOn.toISOString(),
          pricePaid,
          clubSlugs: resolvedClubs,
          source: "portal_create",
          isReturning,
          randwijckBundle: effectiveBundle ?? null,
          keyDeposit: keyDeposit
            ? { notional: keyDeposit.notional, billed: keyDeposit.billed }
            : null,
        },
      });

      const now = new Date();
      for (const leg of paymentPlan) {
        if (leg.amount <= 0) continue;
        await tx.payment.create({
          data: {
            amount: new Prisma.Decimal(leg.amount),
            currency: "EUR",
            status: "paid",
            description: leg.description,
            paidByPersonId: person.id,
            paidByHouseholdId: householdId,
            paidAt: now,
            lines: {
              create: [
                {
                  amount: new Prisma.Decimal(leg.amount),
                  description: leg.description,
                  membershipId: created.id,
                },
              ],
            },
          },
        });
      }

      await absorbShadowedMemberships(tx, {
        id: created.id,
        householdId,
        coverageTier: tier,
        clubSlugs: resolvedClubs,
        assignedPersonId: bindingResult.assignedPersonId,
      });
    });

    await touchBuyer(person.id);
    revalidateMembershipViews();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create membership.",
    };
  }
}

/**
 * Apply a previously-presented upgrade offer. We re-derive the offer
 * server-side from the current household state so a stale client payload
 * (e.g. someone clicked an offer that's no longer applicable) can't
 * sneak through with the wrong price.
 */
export async function upgradeMembership(
  input: unknown,
): Promise<UpgradeMembershipResult> {
  const { person, householdId } = await requireMember();
  if (!householdId) {
    return {
      ok: false,
      error: "Your account isn't linked to a household yet.",
    };
  }

  const parsed = UpgradeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid upgrade selection." };
  }
  const { offerId } = parsed.data;

  const memberships = await getMembershipsForHousehold(householdId);
  const active: ActiveMembershipSnapshot[] = memberships
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.id,
      coverageTier: m.coverageTier,
      clubSlugs: m.clubSlugs,
      pricePaid: m.pricePaid,
    }));

  // Upgrades are always priced as if the buyer is a returning member —
  // they already hold a membership, so the prorated-new-member ladder
  // doesn't apply. Their existing pricePaid is credited.
  const isReturning = await isReturningHousehold(householdId);
  const upgradeCtx: PricingContext = { isReturning: true };
  void isReturning;

  const offers = availableUpgrades({ active, ctx: upgradeCtx });
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) {
    return {
      ok: false,
      error:
        "That upgrade isn't available anymore — your memberships changed since the page loaded. Refresh and try again.",
    };
  }

  const seasonError = ensureClubsInSeason(offer.target.clubs);
  if (seasonError) return { ok: false, error: seasonError };

  const clubRows = await prisma.club.findMany({
    where: { slug: { in: offer.target.clubs }, isActive: true, archivedAt: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true },
  });
  if (clubRows.length !== offer.target.clubs.length) {
    return {
      ok: false,
      error:
        "One of the clubs in this upgrade is unavailable right now. Try again in a moment.",
    };
  }

  const dateRange = freshDateRange({ clubs: offer.target.clubs });

  await prisma.$transaction(async (tx) => {
    const carriedAssignee =
      offer.target.tier === "family"
        ? null
        : await deriveAssigneeFromReplaces(tx, offer.replaces, householdId);

    const created = await tx.membership.create({
      data: {
        householdId,
        assignedPersonId: carriedAssignee,
        coverageTier: offer.target.tier,
        status: "active",
        startsOn: dateRange.startsOn,
        expiresOn: dateRange.expiresOn,
        pricePaid: new Prisma.Decimal(offer.netPrice),
        paidAt: new Date(),
        membershipClubs: {
          create: clubRows.map((c) => ({ clubId: c.id })),
        },
      },
      select: { id: true },
    });
    await recordAudit({
      tx,
      tableName: "memberships",
      rowId: created.id,
      action: "insert",
      changedByPersonId: person.id,
      after: {
        householdId,
        assignedPersonId: carriedAssignee,
        coverageTier: offer.target.tier,
        status: "active",
        startsOn: dateRange.startsOn.toISOString(),
        expiresOn: dateRange.expiresOn.toISOString(),
        netPrice: offer.netPrice,
        clubSlugs: offer.target.clubs,
        replaces: offer.replaces,
        source: "portal_upgrade",
        offerId: offer.id,
      },
    });
    if (offer.replaces.length > 0) {
      const replacedRows = await tx.membership.findMany({
        where: { id: { in: offer.replaces }, householdId, status: "active" },
        select: { id: true, status: true, coverageTier: true, expiresOn: true },
      });
      await tx.membership.updateMany({
        where: { id: { in: offer.replaces }, householdId, status: "active" },
        data: { status: "cancelled" },
      });
      for (const row of replacedRows) {
        await recordAudit({
          tx,
          tableName: "memberships",
          rowId: row.id,
          action: "update",
          changedByPersonId: person.id,
          before: row,
          after: {
            status: "cancelled",
            reason: "absorbed_by_upgrade",
            replacedByMembershipId: created.id,
          },
        });
      }
    }
    await absorbShadowedMemberships(tx, {
      id: created.id,
      householdId,
      coverageTier: offer.target.tier,
      clubSlugs: offer.target.clubs,
      assignedPersonId: carriedAssignee,
    });
  });

  await touchBuyer(person.id);
  revalidateMembershipViews();
  return { ok: true, netPrice: offer.netPrice };
}

function capitalizeTier(tier: "adult" | "child" | "family"): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function bundleLabelFor(id: RandwijckBundleId): string {
  return id === "summer" ? "Summer pass" : "Late-season pass";
}

function priceForBundle(id: RandwijckBundleId): number {
  const bundle = randwijckBundleById(id);
  if (!bundle) {
    throw new Error(`Unknown Randwijck bundle: ${id}`);
  }
  return bundle.amountEur;
}

function orderedUniqueClubs(input: ClubSlug[]): ClubSlug[] {
  const set = new Set<ClubSlug>(input);
  const out: ClubSlug[] = [];
  if (set.has("triaz")) out.push("triaz");
  if (set.has("randwijck")) out.push("randwijck");
  return out;
}

function columnFromClubs(clubs: ClubSlug[]): "triaz" | "randwijck" | "both" {
  if (clubs.length === 2) return "both";
  return clubs[0] === "randwijck" ? "randwijck" : "triaz";
}

function validateBinding(args: {
  tier: "adult" | "child" | "family";
  assignedPersonId?: string;
  own: Awaited<ReturnType<typeof getHouseholdBuyContext>>;
  clubs: ClubSlug[];
  availability: CellAvailability;
}): { ok: true; assignedPersonId: string | null } | { ok: false; error: string } {
  const { tier, assignedPersonId, own, clubs, availability } = args;
  if (tier === "family") {
    if (assignedPersonId) return { ok: false, error: "Family memberships are household-wide." };
    return { ok: true, assignedPersonId: null };
  }
  if (tier === "adult") {
    if (assignedPersonId && assignedPersonId !== own.buyerPersonId) {
      return { ok: false, error: "Adult memberships must be assigned to the buying adult." };
    }
    return { ok: true, assignedPersonId: own.buyerPersonId };
  }

  if (!assignedPersonId) {
    const eligible =
      availability.kind === "unlocked" ? (availability.eligibleAssignees ?? []) : [];
    const householdChildren = own.householdMembers.filter((m) => !m.isAdult);

    if (eligible.length === 0 && householdChildren.length === 0) {
      return {
        ok: false,
        error:
          "No child in your household yet. Add a child from My family first, then try again.",
      };
    }
    if (eligible.length === 0) {
      return {
        ok: false,
        error:
          "Every child in your household already has this membership at those clubs.",
      };
    }
    if (eligible.length === 1) {
      return { ok: true, assignedPersonId: eligible[0].personId };
    }
    return { ok: false, error: "Choose which child this membership should apply to." };
  }
  const member = own.householdMembers.find((m) => m.personId === assignedPersonId);
  if (!member || member.isAdult) {
    return { ok: false, error: "Selected child is not in your household." };
  }
  const alreadyCovered = own.seats.some(
    (s) =>
      s.tier === "child" &&
      s.assignedPersonId === assignedPersonId &&
      clubs.includes(s.clubSlug),
  );
  if (alreadyCovered) {
    return { ok: false, error: "This child already has coverage at that club." };
  }
  return { ok: true, assignedPersonId };
}

async function deriveAssigneeFromReplaces(
  tx: Prisma.TransactionClient,
  replaces: string[],
  householdId: string,
): Promise<string | null> {
  if (replaces.length === 0) return null;
  const rows = await tx.membership.findMany({
    where: { id: { in: replaces }, householdId },
    select: { assignedPersonId: true },
  });
  const distinct = new Set(rows.map((r) => r.assignedPersonId));
  if (distinct.size === 1) return rows[0].assignedPersonId;
  return null;
}

function freshDateRange(args: {
  clubs: ClubSlug[];
  randwijckBundleId?: RandwijckBundleId;
}): { startsOn: Date; expiresOn: Date } {
  const today = new Date();
  const startsOn = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  // Bundle purchases override the season-aware end date with the
  // bundle's window (Apr–Jun → 30 Jun, Jul–Oct → 31 Oct).
  if (args.randwijckBundleId) {
    const bundle = randwijckBundleById(args.randwijckBundleId);
    if (bundle) {
      const year = startsOn.getUTCFullYear();
      const expiresOn = new Date(
        Date.UTC(year, bundle.endMonth - 1, bundle.endDay + 1),
      );
      return { startsOn, expiresOn };
    }
  }
  const expiresOn = newMembershipEndsOn({ clubs: args.clubs, date: startsOn });
  return { startsOn, expiresOn };
}

function ensureClubsInSeason(clubs: ClubSlug[]): string | null {
  for (const slug of clubs) {
    if (clubAvailableOn(slug)) continue;
    if (slug === "randwijck") {
      const next = randwijckStatusOn().upcoming;
      return `Randwijck is closed for the season. It reopens on ${formatLongDate(next.startsOn)} — try again then or pick a Triaz-only membership.`;
    }
    return `${slug} is currently closed.`;
  }
  return null;
}

async function touchBuyer(personId: string) {
  await prisma.person.update({
    where: { id: personId },
    data: { lastLoginAt: new Date() },
  });
}

function revalidateMembershipViews() {
  revalidatePath("/portal/membership");
  revalidatePath("/portal");
}
