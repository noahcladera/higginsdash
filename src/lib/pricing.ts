/**
 * Membership pricing & upgrade catalog — Higgins facade.
 *
 * All the numeric pricing rules for Higgins now live in
 * {@link HIGGINS_PRICING_CONFIG} (see `src/lib/pricing/config.ts`). This
 * file is the **public API** surface the rest of the app has always
 * used — every export below still exists, but its data now derives from
 * the config object. Swap the config to swap the tenant.
 *
 * The original price shape (both for compat and for the sake of the
 * readers below who know the rules):
 *
 *   - **Triaz** sells by quarter. New joiners pay a quarterly fraction
 *     (100% Apr–Jun, 75% Jul–Sep, 50% Oct–Dec, 25% Jan–Mar) of the
 *     full-year fee. Adult Triaz also requires a €10 key deposit which
 *     we model but do *not* bill yet (the gate isn't connected — see
 *     {@link BILL_KEY_DEPOSIT}).
 *   - **Randwijck** has a 7-month playable season (Apr–Oct). New joiners
 *     pay a per-month prorated rate (`RANDWIJCK_PRORATED_BY_MONTH`) or
 *     pick a flat-rate seasonal bundle.
 *   - **Returning members** never prorate.
 *   - **Joint coverage** (Triaz + Randwijck on one membership) — Triaz
 *     always sees its full quarterly portion; the joint discount is
 *     absorbed entirely by the Randwijck portion.
 *   - Family memberships are Randwijck-only; no joint family product.
 */

import {
  HIGGINS_PRICING_CONFIG,
  type MembershipTier as ConfigMembershipTier,
  type PricingBundle,
  type PricingConfig,
} from "@/lib/pricing/config";

export type MembershipTier = ConfigMembershipTier;
/**
 * Legacy narrowed club slug used across Higgins code. The generic config
 * layer uses `string`; this alias documents Higgins' two-club shape at
 * every existing call site without forcing a codebase-wide rename.
 */
export type ClubSlug = "triaz" | "randwijck";

/**
 * The pricing config driving every helper in this file. Assigned once to
 * Higgins — a future tenant-aware variant would read the current org from
 * `@/lib/tenant` and pick `HIGGINS_PRICING_CONFIG` vs an alt.
 *
 * Exported for tests and admin tooling that want to introspect the
 * active config (e.g. the "Pricing" admin page we'll build in Pass 2).
 */
export const ACTIVE_PRICING_CONFIG: PricingConfig = HIGGINS_PRICING_CONFIG;

export const MEMBERSHIP_CURRENCY = ACTIVE_PRICING_CONFIG.currency;
export const MEMBERSHIP_DURATION_DAYS =
  ACTIVE_PRICING_CONFIG.membershipDurationDays;

/* ------------------------------------------------------------------- */
/* Triaz — full year + quarter-of-join proration                         */
/* ------------------------------------------------------------------- */

const TRIAZ_CLUB = ACTIVE_PRICING_CONFIG.clubs.triaz!;
const TRIAZ_PRORATION =
  TRIAZ_CLUB.proration.kind === "quarterly" ? TRIAZ_CLUB.proration : null;

/**
 * Full-year Triaz prices in EUR. Family is not a Triaz product (Triaz
 * has no family tier; Family is Randwijck-only) so it's omitted.
 */
export const TRIAZ_FULL_YEAR: Record<"adult" | "child", number> = {
  adult: TRIAZ_CLUB.fullYear.adult ?? 0,
  child: TRIAZ_CLUB.fullYear.child ?? 0,
};

export type TriazQuarter = "q1_apr_jun" | "q2_jul_sep" | "q3_oct_dec" | "q4_jan_mar";

/** Fraction of the full-year fee charged to a new member joining in this quarter. */
export const TRIAZ_QUARTER_FRACTION: Record<TriazQuarter, number> = {
  q1_apr_jun: TRIAZ_PRORATION?.fractions.q1_apr_jun ?? 1,
  q2_jul_sep: TRIAZ_PRORATION?.fractions.q2_jul_sep ?? 1,
  q3_oct_dec: TRIAZ_PRORATION?.fractions.q3_oct_dec ?? 1,
  q4_jan_mar: TRIAZ_PRORATION?.fractions.q4_jan_mar ?? 1,
};

export const TRIAZ_QUARTER_LABEL: Record<TriazQuarter, string> = {
  q1_apr_jun: TRIAZ_PRORATION?.labels.q1_apr_jun ?? "Apr – Jun",
  q2_jul_sep: TRIAZ_PRORATION?.labels.q2_jul_sep ?? "Jul – Sep",
  q3_oct_dec: TRIAZ_PRORATION?.labels.q3_oct_dec ?? "Oct – Dec",
  q4_jan_mar: TRIAZ_PRORATION?.labels.q4_jan_mar ?? "Jan – Mar",
};

/** Map a Date to the Triaz proration quarter that contains it. */
export function triazQuarterFor(date: Date): TriazQuarter {
  if (TRIAZ_PRORATION) {
    return TRIAZ_PRORATION.quarterFor(date) as TriazQuarter;
  }
  return "q1_apr_jun";
}

/* ------------------------------------------------------------------- */
/* Randwijck — full year + per-month proration + seasonal bundles        */
/* ------------------------------------------------------------------- */

const RANDWIJCK_CLUB = ACTIVE_PRICING_CONFIG.clubs.randwijck!;
const RANDWIJCK_PRORATION =
  RANDWIJCK_CLUB.proration.kind === "monthly" ? RANDWIJCK_CLUB.proration : null;

/** Full-year Randwijck prices in EUR. Family covers everyone in the household. */
export const RANDWIJCK_FULL_YEAR: Record<MembershipTier, number> = {
  adult: RANDWIJCK_CLUB.fullYear.adult ?? 0,
  child: RANDWIJCK_CLUB.fullYear.child ?? 0,
  family: RANDWIJCK_CLUB.fullYear.family ?? 0,
};

/**
 * Per-month-of-join prorated Randwijck prices.
 *
 *   - Apr & May aren't in the table — joiners those months pay the full
 *     season fee (the season just opened).
 *   - Jun → Oct prorate down month by month.
 *
 * Months outside this map mean Randwijck is closed and the buy menu
 * shouldn't surface a Randwijck purchase at all (see
 * `clubAvailableOn` / `randwijckStatusOn` in `membership-seasons.ts`).
 */
export const RANDWIJCK_PRORATED_BY_MONTH: Record<
  MembershipTier,
  Partial<Record<number, number>>
> = RANDWIJCK_PRORATION?.perMonth ?? {
  adult: {},
  child: {},
  family: {},
};

export type RandwijckBundleId = "summer" | "late_season";

export interface RandwijckBundle {
  id: RandwijckBundleId;
  label: string;
  /** EUR. Currently adult-only, hence one number rather than a per-tier map. */
  amountEur: number;
  /** Inclusive start month (1–12). */
  startMonth: number;
  /** Inclusive end month (1–12). */
  endMonth: number;
  /** Day-of-month the coverage ends (used to compute `expiresOn`). */
  endDay: number;
  /** Tiers this bundle is sold for. Currently adult only. */
  eligibleTiers: ReadonlyArray<MembershipTier>;
  description: string;
}

function bundleFromConfig(b: PricingBundle): RandwijckBundle {
  return {
    id: b.id as RandwijckBundleId,
    label: b.label,
    amountEur: b.amount,
    startMonth: b.startMonth,
    endMonth: b.endMonth,
    endDay: b.endDay,
    eligibleTiers: b.eligibleTiers,
    description: b.description,
  };
}

/**
 * Flat-rate Randwijck bundles. They're alternative SKUs to the prorated
 * full-year row — a customer picks either the prorated month price OR a
 * bundle, not both. Each bundle expires at the end of its own window
 * regardless of when in that window the buyer joins.
 */
export const RANDWIJCK_BUNDLES: ReadonlyArray<RandwijckBundle> = (
  RANDWIJCK_CLUB.bundles ?? []
).map(bundleFromConfig);

export function randwijckBundleById(id: RandwijckBundleId): RandwijckBundle | undefined {
  return RANDWIJCK_BUNDLES.find((b) => b.id === id);
}

/**
 * Bundles a buyer can actually pick today — currently selectable when
 * the bundle's window is still ahead of (or contains) `date`.
 */
export function availableRandwijckBundlesFor(args: {
  tier: MembershipTier;
  date?: Date;
}): RandwijckBundle[] {
  const date = args.date ?? new Date();
  const month = date.getUTCMonth() + 1;
  return RANDWIJCK_BUNDLES.filter(
    (b) =>
      b.eligibleTiers.includes(args.tier) &&
      // Allow buying a bundle while we're still inside its window
      // (a mid-May buyer can still get a Summer pass for the rest of June).
      month <= b.endMonth,
  );
}

/* ------------------------------------------------------------------- */
/* Joint (Triaz + Randwijck on one membership)                          */
/* ------------------------------------------------------------------- */

/**
 * Joint full-year prices broken into Triaz / Randwijck portions. Triaz
 * always lands its full sticker price; the joint discount is absorbed
 * by the Randwijck portion so the Triaz Mollie account always sees a
 * clean €X come through.
 *
 * - Adult: €225 total = €126 Triaz + €99 Randwijck.
 * - Child: small joint discount mirroring adult's structure.
 * - Family: not a joint product.
 */
export const JOINT_FULL_YEAR: Record<
  "adult" | "child",
  { triazPortion: number; randwijckPortion: number; total: number }
> = {
  adult: {
    triazPortion:
      ACTIVE_PRICING_CONFIG.joint.byTier.adult?.portions.triaz ?? 0,
    randwijckPortion:
      ACTIVE_PRICING_CONFIG.joint.byTier.adult?.portions.randwijck ?? 0,
    total: ACTIVE_PRICING_CONFIG.joint.byTier.adult?.total ?? 0,
  },
  child: {
    triazPortion:
      ACTIVE_PRICING_CONFIG.joint.byTier.child?.portions.triaz ?? 0,
    randwijckPortion:
      ACTIVE_PRICING_CONFIG.joint.byTier.child?.portions.randwijck ?? 0,
    total: ACTIVE_PRICING_CONFIG.joint.byTier.child?.total ?? 0,
  },
};

/* ------------------------------------------------------------------- */
/* Key deposit                                                          */
/* ------------------------------------------------------------------- */

/** EUR. Adult Triaz only; new members get a key, returning members already have one. */
export const KEY_DEPOSIT_EUR = ACTIVE_PRICING_CONFIG.keyDeposit?.amount ?? 0;

/**
 * When `false` we display the key deposit line ("€10 key deposit — not
 * billed yet, gate is being installed") on receipts and the confirm
 * page but never add it to the Mollie total. Flip to `true` once the
 * gate hardware is connected.
 */
export const BILL_KEY_DEPOSIT =
  ACTIVE_PRICING_CONFIG.keyDeposit?.billed ?? false;

export interface KeyDepositLine {
  /** EUR included in the customer total today (0 when not billed). */
  amount: number;
  /** EUR shown for transparency (always €10 when applicable). */
  notional: number;
  /** True when this line counts toward the Mollie total. */
  billed: boolean;
  /** Short label for the receipt / breakdown. */
  label: string;
}

/**
 * Resolve the key-deposit line for a purchase. Returns `null` when the
 * deposit doesn't apply (tier mismatch, no covered club in the buyer's
 * selection, or a returning member whose seat the config excludes).
 */
export function keyDepositLine(args: {
  tier: MembershipTier;
  clubs: ClubSlug[];
  isReturning: boolean;
}): KeyDepositLine | null {
  const dep = ACTIVE_PRICING_CONFIG.keyDeposit;
  if (!dep) return null;
  if (args.tier !== dep.appliesToTier) return null;
  if (!args.clubs.includes(dep.appliesToClub as ClubSlug)) return null;
  if (args.isReturning && dep.skipReturning) return null;
  return {
    amount: dep.billed ? dep.amount : 0,
    notional: dep.amount,
    billed: dep.billed,
    label: dep.billed ? dep.labelBilled : dep.labelUnbilled,
  };
}

/* ------------------------------------------------------------------- */
/* Public price helpers                                                  */
/* ------------------------------------------------------------------- */

export interface PricingContext {
  /** When the customer is joining. Defaults to today. */
  joinDate?: Date;
  /** Returning members never prorate. Defaults to false (treat as new). */
  isReturning?: boolean;
}

function ctxOrDefaults(ctx?: PricingContext): { joinDate: Date; isReturning: boolean } {
  return {
    joinDate: ctx?.joinDate ?? new Date(),
    isReturning: ctx?.isReturning ?? false,
  };
}

/** Round to whole euros (Mollie totals never carry sub-euro cents). */
function roundEur(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Triaz price for a given tier (adult / child only). Falls back to
 * adult pricing if a caller hands us a non-Triaz tier (defensive).
 */
export function priceForTriaz(args: {
  tier: MembershipTier;
  ctx?: PricingContext;
}): number {
  const { joinDate, isReturning } = ctxOrDefaults(args.ctx);
  if (args.tier === "family") return 0;
  const base = TRIAZ_FULL_YEAR[args.tier];
  if (isReturning) return base;
  const fraction = TRIAZ_QUARTER_FRACTION[triazQuarterFor(joinDate)];
  return roundEur(base * fraction);
}

/**
 * Randwijck price for a given tier. Returns the prorated month-of-join
 * price for new members, full year for returning. Returns the full-year
 * price for non-prorated months (Apr / May).
 */
export function priceForRandwijck(args: {
  tier: MembershipTier;
  ctx?: PricingContext;
}): number {
  const { joinDate, isReturning } = ctxOrDefaults(args.ctx);
  const base = RANDWIJCK_FULL_YEAR[args.tier];
  if (isReturning) return base;
  const month = joinDate.getUTCMonth() + 1;
  const prorated = RANDWIJCK_PRORATED_BY_MONTH[args.tier][month];
  return prorated ?? base;
}

/**
 * Joint Triaz + Randwijck full-year price (no proration applied). Used
 * by the "best value" copy and as the basis for proration math.
 */
export function jointFullYear(tier: MembershipTier): {
  triazPortion: number;
  randwijckPortion: number;
  total: number;
} {
  if (tier === "family") {
    return {
      triazPortion: 0,
      randwijckPortion: RANDWIJCK_FULL_YEAR.family,
      total: RANDWIJCK_FULL_YEAR.family,
    };
  }
  return JOINT_FULL_YEAR[tier];
}

/**
 * Compute the joint price the customer pays today, with proration baked
 * in. Returning members get the full joint sticker; new members get the
 * prorated Triaz portion + prorated Randwijck portion, where the joint
 * discount applies to the Randwijck portion (see `splitJointPrice`).
 */
export function priceForJoint(args: {
  tier: MembershipTier;
  ctx?: PricingContext;
}): { triazPortion: number; randwijckPortion: number; total: number } {
  const { joinDate, isReturning } = ctxOrDefaults(args.ctx);
  const full = jointFullYear(args.tier);
  if (isReturning || args.tier === "family") return full;

  // Triaz portion follows Triaz's quarter ladder.
  const triazFraction = TRIAZ_QUARTER_FRACTION[triazQuarterFor(joinDate)];
  const triazPortion = roundEur(full.triazPortion * triazFraction);

  // Randwijck portion follows Randwijck's per-month ladder, scaled to
  // the discounted joint Randwijck portion (€99 vs €189 for adult).
  // We use the same discount ratio at every month so the proration
  // table stays a simple multiplier off the joint-Randwijck base.
  const randwijckBase = RANDWIJCK_FULL_YEAR[args.tier];
  const randwijckMonthPrice = priceForRandwijck({ tier: args.tier, ctx: { joinDate, isReturning } });
  const ratio = randwijckBase > 0 ? full.randwijckPortion / randwijckBase : 0;
  const randwijckPortion = roundEur(randwijckMonthPrice * ratio);

  return { triazPortion, randwijckPortion, total: roundEur(triazPortion + randwijckPortion) };
}

/**
 * Split a joint membership into Triaz / Randwijck halves so each can be
 * routed to its own Mollie account. Triaz always lands its full
 * (prorated) portion; the joint discount is absorbed by Randwijck.
 */
export function splitJointPrice(
  tier: MembershipTier,
  ctx?: PricingContext,
): { triazPortion: number; randwijckPortion: number; randwijckDiscount: number; total: number } {
  const joint = priceForJoint({ tier, ctx });
  const randwijckSingle = priceForRandwijck({ tier, ctx });
  return {
    triazPortion: joint.triazPortion,
    randwijckPortion: joint.randwijckPortion,
    randwijckDiscount: Math.max(0, randwijckSingle - joint.randwijckPortion),
    total: joint.total,
  };
}

/** Price for a coverage shape (1 club or both). */
export function priceForCoverage(args: {
  tier: MembershipTier;
  clubCount: 1 | 2;
  ctx?: PricingContext;
}): number {
  if (args.clubCount === 2) return priceForJoint({ tier: args.tier, ctx: args.ctx }).total;
  // For single-club without specifying which one, default to the
  // higher-priced club so we never undersell a fallback. Callers that
  // know the club should call `priceForTriaz` / `priceForRandwijck`
  // directly.
  if (args.tier === "family") return priceForRandwijck({ tier: args.tier, ctx: args.ctx });
  return Math.max(
    priceForTriaz({ tier: args.tier, ctx: args.ctx }),
    priceForRandwijck({ tier: args.tier, ctx: args.ctx }),
  );
}

/** Saving (EUR) of a joint membership vs two single-club memberships of the same tier. */
export function jointSavings(tier: MembershipTier, ctx?: PricingContext): number {
  if (tier === "family") return 0;
  const joint = priceForJoint({ tier, ctx }).total;
  const sumOfSingles = priceForTriaz({ tier, ctx }) + priceForRandwijck({ tier, ctx });
  return Math.max(0, sumOfSingles - joint);
}

/* ------------------------------------------------------------------- */
/* Legacy compat: MEMBERSHIP_PRICES                                      */
/* ------------------------------------------------------------------- */

/**
 * Back-compat shim — pre-rewrite callers (marketing copy, the old book
 * gate, etc.) read this matrix to surface a "from €X / year" headline.
 * We keep it populated with **full-year, returning-member** prices so
 * the displayed numbers match the office's published rates regardless
 * of when a non-member visits the page.
 */
export const MEMBERSHIP_PRICES: Record<
  MembershipTier,
  { single: number; joint: number }
> = {
  adult: { single: TRIAZ_FULL_YEAR.adult, joint: JOINT_FULL_YEAR.adult.total },
  child: { single: TRIAZ_FULL_YEAR.child, joint: JOINT_FULL_YEAR.child.total },
  family: { single: RANDWIJCK_FULL_YEAR.family, joint: RANDWIJCK_FULL_YEAR.family },
};

/* ------------------------------------------------------------------- */
/* Buy-menu availability + effective-price                               */
/* ------------------------------------------------------------------- */

/**
 * Snapshot of an active membership relevant for the upgrade calculator.
 * Comes from `getMembershipsForHousehold` (filter to active + map down).
 */
export interface ActiveMembershipSnapshot {
  id: string;
  coverageTier: MembershipTier;
  clubSlugs: ClubSlug[];
  /** EUR actually paid; null for legacy/seed rows pre-pricePaid. */
  pricePaid: number | null;
}

export interface UpgradeOffer {
  id: string;
  label: string;
  description: string;
  replaces: string[];
  target: { tier: MembershipTier; clubs: ClubSlug[] };
  listPrice: number;
  credit: number;
  netPrice: number;
  creditEstimated: boolean;
}

const ALL_CLUBS: ClubSlug[] = ["triaz", "randwijck"];
const COLUMN_TO_CLUBS: Record<"triaz" | "randwijck" | "both", ClubSlug[]> = {
  triaz: ["triaz"],
  randwijck: ["randwijck"],
  both: ["triaz", "randwijck"],
};

export interface HouseholdOwnership {
  seats: Array<{
    membershipId: string;
    tier: MembershipTier;
    clubSlug: ClubSlug;
    assignedPersonId: string | null;
  }>;
  householdMembers: Array<{
    personId: string;
    firstName: string;
    lastName: string;
    isAdult: boolean;
    isStudent: boolean;
  }>;
  buyerPersonId: string;
}

export type CellAvailability =
  | {
      kind: "unlocked";
      eligibleAssignees?: Array<{ personId: string; label: string }>;
      coveredAssignees?: Array<{ personId: string; label: string }>;
    }
  | { kind: "owned_by_self"; byPersonId: string }
  | { kind: "absorbed_by_family" }
  | { kind: "both_clubs_partial"; missingClub: ClubSlug };

function clubsFor(column: "triaz" | "randwijck" | "both"): ClubSlug[] {
  return COLUMN_TO_CLUBS[column];
}

function hasSeat(
  own: HouseholdOwnership,
  tier: MembershipTier,
  clubSlug: ClubSlug,
): boolean {
  return own.seats.some((s) => s.tier === tier && s.clubSlug === clubSlug);
}

function coveredByFamily(own: HouseholdOwnership, clubSlug: ClubSlug): boolean {
  return hasSeat(own, "family", clubSlug);
}

function memberLabel(m: { firstName: string; lastName: string }): string {
  return `${m.firstName} ${m.lastName}`.trim();
}

export function availabilityFor(
  tier: MembershipTier,
  column: "triaz" | "randwijck" | "both",
  own: HouseholdOwnership,
): CellAvailability {
  const clubs = clubsFor(column);
  const ownedOnClub = (club: ClubSlug) => hasSeat(own, tier, club);

  if (column === "both") {
    const owned = clubs.filter((club) => ownedOnClub(club) || coveredByFamily(own, club));
    if (owned.length === 1) {
      const missingClub = clubs.find((club) => !owned.includes(club));
      if (missingClub) return { kind: "both_clubs_partial", missingClub };
    }
    if (owned.length === 2) return { kind: "owned_by_self", byPersonId: own.buyerPersonId };
  }

  if (clubs.some((club) => coveredByFamily(own, club))) {
    return { kind: "absorbed_by_family" };
  }

  if (tier === "adult") {
    if (clubs.every((club) => own.seats.some((s) => s.tier === "adult" && s.clubSlug === club && s.assignedPersonId === own.buyerPersonId))) {
      return { kind: "owned_by_self", byPersonId: own.buyerPersonId };
    }
    return { kind: "unlocked" };
  }

  if (tier === "family") {
    if (clubs.every((club) => hasSeat(own, "family", club))) {
      return { kind: "owned_by_self", byPersonId: own.buyerPersonId };
    }
    return { kind: "unlocked" };
  }

  const children = own.householdMembers.filter((m) => !m.isAdult);
  const eligible = children.filter((m) =>
    clubs.every(
      (club) =>
        !own.seats.some(
          (s) =>
            s.tier === "child" &&
            s.clubSlug === club &&
            s.assignedPersonId === m.personId,
        ),
    ),
  );
  const covered = children.filter((m) => !eligible.some((e) => e.personId === m.personId));
  return {
    kind: "unlocked",
    eligibleAssignees: eligible.map((m) => ({
      personId: m.personId,
      label: memberLabel(m),
    })),
    coveredAssignees:
      covered.length > 0
        ? covered.map((m) => ({ personId: m.personId, label: memberLabel(m) }))
        : undefined,
  };
}

/**
 * Effective price the buy-menu shows for a (tier, column) cell, taking
 * the household's existing coverage into account. If they already hold
 * the *other* club at the same tier, the marginal price to add this one
 * is cheaper than the standalone single — we surface that.
 */
export function effectivePriceFor(
  tier: MembershipTier,
  column: "triaz" | "randwijck" | "both",
  own: HouseholdOwnership,
  ctx?: PricingContext,
): { amountEur: number; kind: "single" | "joint" | "marginal"; savingsEur: number } {
  const clubs = clubsFor(column);

  if (clubs.length === 2) {
    const joint = priceForJoint({ tier, ctx });
    const sumOfSingles = priceForTriaz({ tier, ctx }) + priceForRandwijck({ tier, ctx });
    return {
      amountEur: joint.total,
      kind: "joint",
      savingsEur: Math.max(0, sumOfSingles - joint.total),
    };
  }

  const target = clubs[0];
  const other = target === "triaz" ? "randwijck" : "triaz";
  const hasOtherTier = hasSeat(own, tier, other) || coveredByFamily(own, other);

  const standalone =
    target === "triaz"
      ? priceForTriaz({ tier, ctx })
      : priceForRandwijck({ tier, ctx });

  if (hasOtherTier) {
    // Marginal: total joint minus what was already paid on the other
    // single. We use the catalog single for the other side as a
    // best-effort credit (per-row pricePaid lookup happens in the
    // upgrade engine; this is the buy-menu hint).
    const joint = priceForJoint({ tier, ctx }).total;
    const otherSingle =
      other === "triaz" ? priceForTriaz({ tier, ctx }) : priceForRandwijck({ tier, ctx });
    const marginal = Math.max(0, joint - otherSingle);
    return { amountEur: marginal, kind: "marginal", savingsEur: Math.max(0, standalone - marginal) };
  }
  return { amountEur: standalone, kind: "single", savingsEur: 0 };
}

/**
 * Server-side authoritative price for a purchase. Mirrors the logic the
 * buy menu used, but routes through the same `priceFor*` helpers.
 */
export function priceForPurchase(args: {
  tier: MembershipTier;
  clubs: ClubSlug[];
  ownership: HouseholdOwnership;
  ctx?: PricingContext;
}): number {
  const ordered = Array.from(new Set(args.clubs)).sort();
  if (ordered.length === 2) {
    return effectivePriceFor(args.tier, "both", args.ownership, args.ctx).amountEur;
  }
  const column = ordered[0] === "randwijck" ? "randwijck" : "triaz";
  return effectivePriceFor(args.tier, column, args.ownership, args.ctx).amountEur;
}

/* ------------------------------------------------------------------- */
/* Upgrade engine (unchanged in spirit; uses new price helpers)          */
/* ------------------------------------------------------------------- */

function creditFor(m: ActiveMembershipSnapshot): { credit: number; estimated: boolean } {
  if (m.pricePaid != null && m.pricePaid > 0) {
    return { credit: m.pricePaid, estimated: false };
  }
  const tier: MembershipTier =
    m.coverageTier === "adult" || m.coverageTier === "child" || m.coverageTier === "family"
      ? m.coverageTier
      : "adult";
  const clubCount = (m.clubSlugs.length === 2 ? 2 : 1) as 1 | 2;
  return {
    credit: priceForCoverage({ tier, clubCount, ctx: { isReturning: true } }),
    estimated: true,
  };
}

function clubsCovered(active: ActiveMembershipSnapshot[]): Set<ClubSlug> {
  const set = new Set<ClubSlug>();
  for (const m of active) {
    for (const c of m.clubSlugs) set.add(c);
  }
  return set;
}

function clubLabel(slug: ClubSlug): string {
  return slug === "triaz" ? "Triaz" : "Randwijck";
}

function buildOffer(args: {
  id: string;
  label: string;
  description: string;
  replaces: ActiveMembershipSnapshot[];
  targetTier: MembershipTier;
  targetClubs: ClubSlug[];
  ctx?: PricingContext;
}): UpgradeOffer {
  const clubCount = (args.targetClubs.length === 2 ? 2 : 1) as 1 | 2;
  const listPrice = priceForCoverage({ tier: args.targetTier, clubCount, ctx: args.ctx });
  let creditTotal = 0;
  let estimated = false;
  for (const m of args.replaces) {
    const { credit, estimated: e } = creditFor(m);
    creditTotal += credit;
    if (e) estimated = true;
  }
  const credit = Math.max(0, Math.min(listPrice, creditTotal));
  return {
    id: args.id,
    label: args.label,
    description: args.description,
    replaces: args.replaces.map((m) => m.id),
    target: { tier: args.targetTier, clubs: args.targetClubs },
    listPrice,
    credit,
    netPrice: Math.max(0, listPrice - credit),
    creditEstimated: estimated && credit > 0,
  };
}

export function availableUpgrades(args: {
  active: ActiveMembershipSnapshot[];
  ctx?: PricingContext;
}): UpgradeOffer[] {
  const offers: UpgradeOffer[] = [];
  const active = args.active;

  const families = active.filter((m) => m.coverageTier === "family");
  const individuals = active.filter((m) => m.coverageTier !== "family");

  const hasFamily = families.length > 0;
  const familyCovers = clubsCovered(families);
  const individualCovers = clubsCovered(individuals);

  if (!hasFamily) {
    for (const tier of ["adult", "child"] as const) {
      const tierRows = individuals.filter((m) => m.coverageTier === tier);
      if (tierRows.length === 0) continue;

      const tierClubs = clubsCovered(tierRows);
      const missing = ALL_CLUBS.filter((c) => !tierClubs.has(c));

      if (tierClubs.size === 1 && missing.length === 1) {
        const otherClub = missing[0];
        offers.push(
          buildOffer({
            id: `extend-${tier}-joint`,
            label: `Add ${clubLabel(otherClub)} to your ${tier} membership`,
            description: `Combine your existing ${tier} membership with ${clubLabel(otherClub)} for the joint price.`,
            replaces: tierRows,
            targetTier: tier,
            targetClubs: ["triaz", "randwijck"],
            ctx: args.ctx,
          }),
        );
      }
    }
  }

  if (!hasFamily && individuals.length > 0) {
    const coveredList = Array.from(individualCovers);
    if (coveredList.length === 1) {
      const club = coveredList[0];
      offers.push(
        buildOffer({
          id: `family-single-${club}`,
          label: `Upgrade to family at ${clubLabel(club)}`,
          description: `Cover everyone in your household at ${clubLabel(club)}.`,
          replaces: individuals,
          targetTier: "family",
          targetClubs: [club],
          ctx: args.ctx,
        }),
      );
    }

    offers.push(
      buildOffer({
        id: "family-joint",
        label: "Upgrade to family (both clubs)",
        description: "Everyone in your household, both clubs, one membership.",
        replaces: individuals,
        targetTier: "family",
        targetClubs: ["triaz", "randwijck"],
        ctx: args.ctx,
      }),
    );
  }

  if (families.length === 1 && familyCovers.size === 1) {
    const family = families[0];
    const otherClub = ALL_CLUBS.find((c) => !familyCovers.has(c));
    if (otherClub) {
      offers.push(
        buildOffer({
          id: "family-extend-joint",
          label: `Add ${clubLabel(otherClub)} to your family membership`,
          description: "Extend your family membership to cover both clubs.",
          replaces: [family],
          targetTier: "family",
          targetClubs: ["triaz", "randwijck"],
          ctx: args.ctx,
        }),
      );
    }
  }

  return offers;
}

/** Human-readable description of a coverage shape. */
export function coverageDescription(args: {
  tier: MembershipTier;
  clubs: ClubSlug[];
}): string {
  const tierLabel =
    args.tier === "family" ? "Family" : args.tier === "adult" ? "Adult" : "Child";
  if (args.clubs.length === 2) return `${tierLabel} - both clubs`;
  if (args.clubs.length === 1) return `${tierLabel} - ${clubLabel(args.clubs[0])} only`;
  return tierLabel;
}

/** Format a membership amount as a locale-aware currency string. */
export function formatMembershipPrice(amount: number): string {
  try {
    return new Intl.NumberFormat(ACTIVE_PRICING_CONFIG.locale, {
      style: "currency",
      currency: ACTIVE_PRICING_CONFIG.currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `€${amount}`;
  }
}
