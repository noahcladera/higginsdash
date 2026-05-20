/**
 * Per-org pricing configuration.
 *
 * Pass 2 of the "one codebase, two packagings" rollout extracts Higgins'
 * membership pricing rules out of hardcoded module constants into a typed
 * {@link PricingConfig} object. The config captures every knob that varies
 * between tenants:
 *
 *   - Full-year prices per club, per tier (adult / child / family).
 *   - Proration strategy per club (Higgins has two: Triaz quarterly,
 *     Randwijck monthly).
 *   - Joint (multi-club) offerings + how joint discounts split between
 *     clubs when routed to different payment accounts.
 *   - Seasonal flat-rate bundles ("Summer pass" style).
 *   - Key-deposit rules (Higgins-specific for now, flipped by feature
 *     flag).
 *   - Currency + locale for display formatting.
 *
 * The canonical instance is {@link HIGGINS_PRICING_CONFIG}. A future
 * "Higgins USA" org would ship its own `USA_PRICING_CONFIG` and swap here;
 * a programs-mode org ships a much smaller config (or none, since
 * memberships are disabled entirely in programs mode).
 *
 * The legacy module constants in `src/lib/pricing.ts` now derive from this
 * config — every existing caller keeps its public API.
 */

export type MembershipTier = "adult" | "child" | "family";

/**
 * Higgins has exactly two clubs. Other orgs can have more; we key clubs
 * by string slug everywhere and never assume a closed union downstream.
 * The legacy `ClubSlug` type alias in `pricing.ts` narrows back to
 * `"triaz" | "randwijck"` for Higgins compile-time safety.
 */
export type ClubSlug = string;

/**
 * Triaz-style quarterly proration — the join quarter determines the
 * fraction of the full-year fee a new member pays.
 */
export interface QuarterlyProration {
  kind: "quarterly";
  /** Map of quarter id → fraction (0..1) of the full-year fee. */
  fractions: Record<string, number>;
  /** Display label per quarter (used by the buy menu). */
  labels: Record<string, string>;
  /**
   * Resolve a Date to its quarter id. Higgins splits the year at
   * Apr/Jul/Oct/Jan. Encoded as a function so non-Higgins orgs can pick
   * their own fiscal boundaries.
   */
  quarterFor: (date: Date) => string;
}

/**
 * Randwijck-style monthly proration — the month of join picks the price
 * from a lookup table. Months outside the table mean the club is closed
 * and the buy menu shouldn't surface a purchase at all.
 */
export interface MonthlyProration {
  kind: "monthly";
  /** Per-tier table: month (1..12) → EUR amount charged when joining that month. */
  perMonth: Record<MembershipTier, Partial<Record<number, number>>>;
}

export interface NoProration {
  kind: "none";
}

export type ProrationStrategy = QuarterlyProration | MonthlyProration | NoProration;

/**
 * Flat-rate seasonal bundle — an alternative SKU to the per-month prorated
 * row. Buyers pick either the prorated month price OR a bundle, not both.
 */
export interface PricingBundle {
  id: string;
  label: string;
  amount: number;
  startMonth: number;
  endMonth: number;
  endDay: number;
  eligibleTiers: ReadonlyArray<MembershipTier>;
  description: string;
}

export interface ClubPricingConfig {
  slug: ClubSlug;
  /** Display label for the club in the buy menu and receipts. */
  label: string;
  /** Full-year EUR price per tier. `null` means the club doesn't sell that tier. */
  fullYear: Record<MembershipTier, number | null>;
  proration: ProrationStrategy;
  bundles?: ReadonlyArray<PricingBundle>;
}

/**
 * Joint (multi-club) offering for a single tier. Triaz always lands its
 * sticker price; the joint discount is absorbed by the "partner" club
 * (Randwijck) so each portion can route to its own payment account.
 */
export interface JointTierConfig {
  clubs: [ClubSlug, ClubSlug];
  /** Sum of the two portions. */
  total: number;
  /** Portion per club (keyed by slug). */
  portions: Record<ClubSlug, number>;
  /**
   * Which club's portion follows quarterly proration vs monthly — for
   * Higgins, Triaz portion follows Triaz's quarter ladder and Randwijck
   * portion follows Randwijck's per-month ladder.
   */
  prorate: Record<ClubSlug, "quarterly" | "monthly" | "none">;
}

export interface JointPricingConfig {
  /** By tier. Missing entries mean the joint product doesn't exist for that tier. */
  byTier: Partial<Record<MembershipTier, JointTierConfig>>;
}

export interface KeyDepositConfig {
  amount: number;
  /** When false, we show the line for transparency but don't bill it. */
  billed: boolean;
  /** The tier this deposit applies to (Higgins: adult only). */
  appliesToTier: MembershipTier;
  /** Club the deposit belongs to (Higgins: Triaz). */
  appliesToClub: ClubSlug;
  /** Returning members already have a key — skip for them. */
  skipReturning: boolean;
  /** Receipt copy when billed / not billed. */
  labelBilled: string;
  labelUnbilled: string;
}

export interface PricingConfig {
  currency: "EUR" | "USD" | "GBP";
  /** Locale used for Intl.NumberFormat when rendering amounts. */
  locale: string;
  /** Membership duration in days (Higgins: 365). */
  membershipDurationDays: number;
  clubs: Record<ClubSlug, ClubPricingConfig>;
  joint: JointPricingConfig;
  keyDeposit: KeyDepositConfig | null;
}

/* ======================================================================= */
/* Higgins Tennis NL config                                                 */
/* ======================================================================= */

function triazQuarterFor(date: Date): string {
  const m = date.getUTCMonth() + 1;
  if (m >= 4 && m <= 6) return "q1_apr_jun";
  if (m >= 7 && m <= 9) return "q2_jul_sep";
  if (m >= 10 && m <= 12) return "q3_oct_dec";
  return "q4_jan_mar";
}

/**
 * The canonical Higgins Tennis NL pricing config. All numbers here match
 * what `src/lib/pricing.ts` used to hardcode — moving them here doesn't
 * change a single customer-facing price. Edit this object to retune
 * Higgins pricing; everywhere else in the code reads it through the
 * helpers in `src/lib/pricing.ts`.
 */
export const HIGGINS_PRICING_CONFIG: PricingConfig = {
  currency: "EUR",
  locale: "nl-NL",
  membershipDurationDays: 365,
  clubs: {
    triaz: {
      slug: "triaz",
      label: "Triaz",
      fullYear: { adult: 126, child: 92, family: null },
      proration: {
        kind: "quarterly",
        fractions: {
          q1_apr_jun: 1.0,
          q2_jul_sep: 0.75,
          q3_oct_dec: 0.5,
          q4_jan_mar: 0.25,
        },
        labels: {
          q1_apr_jun: "Apr – Jun",
          q2_jul_sep: "Jul – Sep",
          q3_oct_dec: "Oct – Dec",
          q4_jan_mar: "Jan – Mar",
        },
        quarterFor: triazQuarterFor,
      },
    },
    randwijck: {
      slug: "randwijck",
      label: "Randwijck",
      fullYear: { adult: 189, child: 89, family: 189 },
      proration: {
        kind: "monthly",
        perMonth: {
          adult: { 6: 135, 7: 108, 8: 81, 9: 54, 10: 27 },
          child: { 6: 70, 7: 56, 8: 42, 9: 28, 10: 14 },
          family: { 6: 135, 7: 108, 8: 81, 9: 54, 10: 27 },
        },
      },
      bundles: [
        {
          id: "summer",
          label: "Summer pass · Apr–Jun",
          amount: 120,
          startMonth: 4,
          endMonth: 6,
          endDay: 30,
          eligibleTiers: ["adult"],
          description:
            "Flat €120 for spring play at Randwijck. Coverage runs through 30 June regardless of when you join.",
        },
        {
          id: "late_season",
          label: "Late-season pass · Jul–Oct",
          amount: 120,
          startMonth: 7,
          endMonth: 10,
          endDay: 31,
          eligibleTiers: ["adult"],
          description:
            "Flat €120 for the back half of the Randwijck season. Coverage runs through 31 October.",
        },
      ],
    },
  },
  joint: {
    byTier: {
      adult: {
        clubs: ["triaz", "randwijck"],
        total: 225,
        portions: { triaz: 126, randwijck: 99 },
        prorate: { triaz: "quarterly", randwijck: "monthly" },
      },
      child: {
        clubs: ["triaz", "randwijck"],
        total: 161,
        portions: { triaz: 92, randwijck: 69 },
        prorate: { triaz: "quarterly", randwijck: "monthly" },
      },
      // Family intentionally absent — not a joint product at Higgins.
    },
  },
  keyDeposit: {
    amount: 10,
    // Gate hardware isn't wired yet; we show the line but don't bill it.
    // Flip to `true` once the gate is connected.
    billed: false,
    appliesToTier: "adult",
    appliesToClub: "triaz",
    skipReturning: true,
    labelBilled: "Key deposit",
    labelUnbilled: "Key deposit (not billed — gate not yet connected)",
  },
};

/**
 * The empty config returned for programs-mode orgs (no memberships).
 * Exists so the pricing helpers never crash when called in programs mode
 * even by components that forgot to check the feature flag.
 */
export const EMPTY_PRICING_CONFIG: PricingConfig = {
  currency: "EUR",
  locale: "en-US",
  membershipDurationDays: 365,
  clubs: {},
  joint: { byTier: {} },
  keyDeposit: null,
};

/**
 * Return every club slug configured in the active pricing config, in
 * declaration order. Used by coverage / catalog query code that needs to
 * filter membership rows to the orgs' known clubs without hardcoding the
 * Higgins pair (`"triaz"`, `"randwijck"`).
 *
 * For Higgins this returns `["triaz", "randwijck"]`. For a programs-mode
 * org with no membership surface it returns `[]`, which is the correct
 * "no club coverage exists" answer.
 *
 * The helper takes the config as an argument so call sites can pass a
 * test config in unit tests and so we don't couple `config.ts` to the
 * `ACTIVE_PRICING_CONFIG` resolver in `pricing.ts`. Pass 2 wires this
 * up to a per-tenant config loader.
 */
export function listConfiguredClubSlugs(
  config: PricingConfig = HIGGINS_PRICING_CONFIG,
): string[] {
  return Object.keys(config.clubs);
}
