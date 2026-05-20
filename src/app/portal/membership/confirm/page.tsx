import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/require-member";
import {
  getHouseholdBuyContext,
} from "@/lib/portal/queries";
import {
  availabilityFor,
  formatMembershipPrice,
  jointFullYear,
  jointSavings,
  keyDepositLine,
  priceForJoint,
  priceForRandwijck,
  priceForTriaz,
  randwijckBundleById,
  type ClubSlug,
  type MembershipTier,
  type RandwijckBundleId,
} from "@/lib/pricing";
import { isReturningHousehold } from "@/lib/memberships/returning";
import {
  formatLongDate,
  newMembershipEndsOn,
  randwijckStatusOn,
} from "@/lib/membership-seasons";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";
import { ConfirmCheckoutButton } from "./confirm-checkout";

/**
 * Middle "what your membership unlocks" page.
 *
 * Sits between the buy-menu tile click and the Mollie checkout. The
 * page is a server component so we can recompute pricing authoritatively
 * (no risk of a stale tab presenting an old number) and resolve which
 * household member the membership will be assigned to.
 *
 * Renders four blocks:
 *   1. A summary of what was selected (tier, clubs, who it covers).
 *   2. A "what this unlocks" benefits list per covered club, mirroring
 *      the wording in `coverage-explainer.tsx`.
 *   3. A line-item price breakdown including the key deposit (with a
 *      "not billed yet" pill when `BILL_KEY_DEPOSIT === false`) and a
 *      reminder of when the membership expires.
 *   4. A confirm-and-pay button that hands off to the demo Mollie page.
 */

export default async function MembershipConfirmPage(props: {
  searchParams: Promise<{
    tier?: string;
    clubs?: string;
    assignedPersonId?: string;
    randwijckBundle?: string;
  }>;
}) {
  const sp = await props.searchParams;
  const tier = parseTier(sp.tier);
  const clubs = parseClubs(sp.clubs);
  const bundleId = parseBundle(sp.randwijckBundle);

  if (!tier || clubs.length === 0) {
    redirect("/portal/membership#buy");
  }

  // Server-side gate: family ⇒ Randwijck-only; bundle ⇒ adult Randwijck.
  if (tier === "family" && clubs.includes("triaz")) {
    redirect("/portal/membership#buy");
  }
  if (bundleId && (tier !== "adult" || clubs.length !== 1 || clubs[0] !== "randwijck")) {
    redirect("/portal/membership#buy");
  }

  const { person, householdId } = await requireMember();
  if (!householdId) {
    redirect("/portal/membership#buy");
  }

  const [ownership, isReturning] = await Promise.all([
    getHouseholdBuyContext(householdId, person.id),
    isReturningHousehold(householdId),
  ]);

  const column = clubs.length === 2 ? "both" : clubs[0];
  const availability = availabilityFor(tier, column, ownership);
  if (
    availability.kind === "owned_by_self" ||
    availability.kind === "absorbed_by_family"
  ) {
    redirect("/portal/membership#buy");
  }

  const resolvedClubs: ClubSlug[] =
    availability.kind === "both_clubs_partial"
      ? [availability.missingClub]
      : clubs;

  // Sticky club narrowing for bundles: if we narrowed to Triaz, drop the bundle.
  const effectiveBundle =
    bundleId &&
    resolvedClubs.length === 1 &&
    resolvedClubs[0] === "randwijck"
      ? bundleId
      : undefined;

  // For child purchases, resolve the assignee. We surface a clear
  // error rather than silently picking — the UI flow (child picker on
  // the buy menu) means assignedPersonId should be in the URL.
  let assignedPersonName: string | null = null;
  if (tier === "child") {
    const assignedId = sp.assignedPersonId;
    if (!assignedId) {
      redirect("/portal/membership#buy");
    }
    const member = ownership.householdMembers.find(
      (m) => m.personId === assignedId,
    );
    if (!member || member.isAdult) {
      redirect("/portal/membership#buy");
    }
    assignedPersonName = `${member.firstName} ${member.lastName}`.trim();
  }

  const today = startOfDayUtc(new Date());
  const ctx = { joinDate: today, isReturning } as const;

  const breakdown = computeBreakdown({
    tier,
    clubs: resolvedClubs,
    bundleId: effectiveBundle,
    isReturning,
  });

  const expiresOn = effectiveBundle
    ? bundleExpiresOn(effectiveBundle, today)
    : newMembershipEndsOn({ clubs: resolvedClubs, date: today });

  const randwijckSeason = randwijckStatusOn();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Confirm your membership"
        title={`${capitalize(tier === "child" ? "youth" : tier)} membership · ${coverageLabel(resolvedClubs, !!effectiveBundle)}`}
        description="Review what's included and the price before we hand you over to checkout."
        actions={
          <Button asChild variant="ghost" tone="neutral">
            <Link href="/portal/membership#buy">Back to options</Link>
          </Button>
        }
      />

      <Section title="What this membership unlocks">
        <BenefitsBlock clubs={resolvedClubs} bundleId={effectiveBundle} />
      </Section>

      <Section title="Price breakdown">
        <PriceTable
          breakdown={breakdown}
          isReturning={isReturning}
          expiresOnLabel={formatLongDate(addDaysVisual(expiresOn, -1))}
          randwijckSeasonLabel={
            resolvedClubs.includes("randwijck") && !effectiveBundle && randwijckSeason.current
              ? formatLongDate(addDaysVisual(randwijckSeason.current.endsOn, -1))
              : null
          }
          assignedPersonName={assignedPersonName}
        />
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-5">
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Total today
          </div>
          <div className="tabular font-display text-3xl font-medium tracking-tight">
            {formatMembershipPrice(breakdown.totalBilled)}
          </div>
          {breakdown.notionalNotBilled > 0 && (
            <div className="text-xs text-[var(--muted-foreground)]">
              + {formatMembershipPrice(breakdown.notionalNotBilled)} key deposit
              shown for transparency, not charged today.
            </div>
          )}
        </div>
        <ConfirmCheckoutButton
          tier={tier}
          clubs={resolvedClubs}
          assignedPersonId={
            tier === "child" ? sp.assignedPersonId ?? null : null
          }
          randwijckBundle={effectiveBundle ?? null}
          totalEur={breakdown.totalBilled}
          triazPortion={breakdown.triazPortion}
          randwijckPortion={breakdown.randwijckPortion}
          headline={
            (tier === "child" ? "Youth" : capitalize(tier)) +
            " membership · " +
            coverageLabel(resolvedClubs, !!effectiveBundle)
          }
        />
      </div>

      {!isReturning && (
        <p className="text-center text-xs text-[var(--muted-foreground)]">
          New members pay the prorated rate for the time ahead of them. If
          you've held a membership before, the office can switch you to the
          full annual rate (and lock in next year's full coverage).
        </p>
      )}
      {isReturning && (
        <p className="text-center text-xs text-[var(--muted-foreground)]">
          Returning members pay the full annual rate — proration is reserved
          for first-time joiners.
        </p>
      )}

      <SavingsHint
        tier={tier}
        resolvedClubs={resolvedClubs}
        isReturning={isReturning}
        ctx={ctx}
      />
    </div>
  );
}

function SavingsHint({
  tier,
  resolvedClubs,
  ctx,
  isReturning,
}: {
  tier: MembershipTier;
  resolvedClubs: ClubSlug[];
  isReturning: boolean;
  ctx: { joinDate: Date; isReturning: boolean };
}) {
  if (tier === "family" || resolvedClubs.length === 2) return null;
  const saving = jointSavings(tier, ctx);
  if (saving <= 0) return null;
  const joint = priceForJoint({ tier, ctx }).total;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--joint-soft)] p-4 text-sm text-[var(--joint-ink)]">
      <Badge tone="joint" variant="solid">
        Best value
      </Badge>
      <span>
        Cover both clubs for {formatMembershipPrice(joint)} and save{" "}
        <strong>{formatMembershipPrice(saving)}</strong> vs buying singles.
      </span>
      <Link
        href={buildJointHref(tier)}
        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline"
      >
        See joint <ArrowRightIcon size={12} />
      </Link>
      {/* isReturning is in ctx already — referenced to avoid unused warning */}
      <span className="sr-only">{isReturning ? "returning" : "new"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benefits block
// ---------------------------------------------------------------------------

const TRIAZ_BENEFITS = [
  "Book any of our four grass courts at no charge, subject to availability.",
  "Daily booking quota of one slot per person — easy to plan around.",
  "Year-round play; Triaz never closes for the season.",
  "Adult ladder, group lessons, camps, and clinics open up to you.",
] as const;

const RANDWIJCK_BENEFITS = [
  "Book the two premium clay courts (B. Borg & J. Mcenroe).",
  "Two booking slots per person, per day — bring a friend or play twice.",
  "Lessons and camps hosted at Randwijck for adults and kids.",
  "Strict 48-hour cancellation window so you can rely on your slot.",
] as const;

function BenefitsBlock({
  clubs,
  bundleId,
}: {
  clubs: ClubSlug[];
  bundleId?: RandwijckBundleId;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {clubs.includes("triaz") && (
        <BenefitCard
          title="Triaz · grass courts"
          tone="triaz"
          lines={[...TRIAZ_BENEFITS]}
          extra="Tue & Wed evenings the venue is shared with the korfball club; some courts may be blocked then."
        />
      )}
      {clubs.includes("randwijck") && (
        <BenefitCard
          title="Randwijck · clay courts"
          tone="randwijck"
          lines={[...RANDWIJCK_BENEFITS]}
          extra={
            bundleId
              ? bundleId === "summer"
                ? "Summer pass: covers play through 30 June. Your seat ends with the spring window — buy a Late-season pass or a prorated single to keep playing past then."
                : "Late-season pass: covers play through 31 October. Coverage ends when the clay season closes."
              : "Randwijck is closed Nov–mid-March. Coverage automatically ends with the season."
          }
        />
      )}
    </div>
  );
}

function BenefitCard({
  title,
  tone,
  lines,
  extra,
}: {
  title: string;
  tone: "triaz" | "randwijck";
  lines: string[];
  extra: string;
}) {
  return (
    <article
      className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--${tone}-soft)] p-5`}
    >
      <h3 className="font-display text-lg font-medium tracking-tight">
        {title}
      </h3>
      <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">{extra}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Price table
// ---------------------------------------------------------------------------

interface PriceBreakdown {
  /** Per-club Mollie totals (sum to `totalBilled`). */
  triazPortion: number;
  randwijckPortion: number;
  /** Sum of every line that actually counts toward the customer total today. */
  totalBilled: number;
  /** Sum of "shown for transparency, not billed" amounts (e.g. key deposit when gate not connected). */
  notionalNotBilled: number;
  lines: PriceLine[];
}

interface PriceLine {
  label: string;
  amountEur: number;
  /** When false the line is shown but doesn't contribute to the billed total. */
  billed: boolean;
  /** Optional small note below the label. */
  note?: string;
}

function computeBreakdown(args: {
  tier: MembershipTier;
  clubs: ClubSlug[];
  bundleId?: RandwijckBundleId;
  isReturning: boolean;
}): PriceBreakdown {
  const ctx = { isReturning: args.isReturning };
  const lines: PriceLine[] = [];
  let triazPortion = 0;
  let randwijckPortion = 0;

  if (args.bundleId) {
    const bundle = randwijckBundleById(args.bundleId);
    if (bundle) {
      lines.push({
        label: bundle.label,
        amountEur: bundle.amountEur,
        billed: true,
      });
      randwijckPortion += bundle.amountEur;
    }
  } else if (args.clubs.length === 2 && args.tier !== "family") {
    const split = priceForJoint({ tier: args.tier, ctx });
    const fullJoint = jointFullYear(args.tier);
    lines.push({
      label: `Triaz portion · ${args.tier === "child" ? "youth" : args.tier}`,
      amountEur: split.triazPortion,
      billed: true,
      note:
        !args.isReturning && split.triazPortion < fullJoint.triazPortion
          ? `Prorated from ${formatMembershipPrice(fullJoint.triazPortion)} full-year.`
          : undefined,
    });
    lines.push({
      label: `Randwijck portion · ${args.tier === "child" ? "youth" : args.tier}`,
      amountEur: split.randwijckPortion,
      billed: true,
      note:
        !args.isReturning && split.randwijckPortion < fullJoint.randwijckPortion
          ? `Prorated from ${formatMembershipPrice(fullJoint.randwijckPortion)} joint full-year.`
          : undefined,
    });
    triazPortion += split.triazPortion;
    randwijckPortion += split.randwijckPortion;
  } else {
    for (const club of args.clubs) {
      const amount =
        club === "triaz"
          ? priceForTriaz({ tier: args.tier, ctx })
          : priceForRandwijck({ tier: args.tier, ctx });
      lines.push({
        label: `${club === "triaz" ? "Triaz" : "Randwijck"} · ${args.tier === "child" ? "youth" : args.tier}`,
        amountEur: amount,
        billed: true,
        note: !args.isReturning ? prorationNoteFor(args.tier, club) : undefined,
      });
      if (club === "triaz") triazPortion += amount;
      else randwijckPortion += amount;
    }
  }

  // Key deposit — only ever applies to Triaz adult memberships.
  const key = keyDepositLine({
    tier: args.tier,
    clubs: args.clubs,
    isReturning: args.isReturning,
  });
  if (key) {
    lines.push({
      label: key.label,
      amountEur: key.notional,
      billed: key.billed,
      note: key.billed
        ? "Refundable when you return the key."
        : "Will be billed once the gate is connected.",
    });
    if (key.billed) triazPortion += key.amount;
  }

  const totalBilled = lines
    .filter((l) => l.billed)
    .reduce((sum, l) => sum + l.amountEur, 0);
  const notionalNotBilled = lines
    .filter((l) => !l.billed)
    .reduce((sum, l) => sum + l.amountEur, 0);

  return {
    triazPortion: round2(triazPortion),
    randwijckPortion: round2(randwijckPortion),
    totalBilled: round2(totalBilled),
    notionalNotBilled: round2(notionalNotBilled),
    lines,
  };
}

function prorationNoteFor(tier: MembershipTier, club: ClubSlug): string | undefined {
  if (tier === "family") return undefined;
  if (club === "triaz") {
    return "Prorated quarter-of-join (full price Apr–Jun, 75% Jul–Sep, 50% Oct–Dec, 25% Jan–Mar).";
  }
  return "Prorated month-of-join (Randwijck season runs Apr–Oct).";
}

function PriceTable({
  breakdown,
  isReturning,
  expiresOnLabel,
  randwijckSeasonLabel,
  assignedPersonName,
}: {
  breakdown: PriceBreakdown;
  isReturning: boolean;
  expiresOnLabel: string;
  randwijckSeasonLabel: string | null;
  assignedPersonName: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <table className="w-full text-sm">
          <tbody>
            {breakdown.lines.map((line, i) => (
              <tr
                key={i}
                className="border-t border-[var(--border)] first:border-t-0"
              >
                <td className="px-5 py-3">
                  <div className="font-medium">{line.label}</div>
                  {line.note && (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {line.note}
                    </div>
                  )}
                </td>
                <td className="tabular w-32 px-5 py-3 text-right font-medium">
                  {line.billed ? (
                    formatMembershipPrice(line.amountEur)
                  ) : (
                    <span className="text-[var(--muted-foreground)]">
                      {formatMembershipPrice(line.amountEur)} (not billed)
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-strong)]">
              <td className="px-5 py-3 font-semibold">Total billed today</td>
              <td className="tabular px-5 py-3 text-right font-display text-lg font-medium tracking-tight">
                {formatMembershipPrice(breakdown.totalBilled)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="grid gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-2">
        <li className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2">
          <strong className="block text-[var(--foreground)]">Coverage ends</strong>
          {expiresOnLabel}
          {randwijckSeasonLabel && (
            <>
              {" "}
              · Randwijck closes {randwijckSeasonLabel}
            </>
          )}
        </li>
        {assignedPersonName && (
          <li className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2">
            <strong className="block text-[var(--foreground)]">Covers</strong>
            {assignedPersonName}
          </li>
        )}
        <li className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2">
          <strong className="block text-[var(--foreground)]">Pricing rule</strong>
          {isReturning
            ? "Returning member — full annual rate."
            : "New member — prorated to your join date."}
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTier(raw: string | undefined): MembershipTier | null {
  if (raw === "adult" || raw === "child" || raw === "family") return raw;
  return null;
}

function parseClubs(raw: string | undefined): ClubSlug[] {
  if (!raw) return [];
  const parts = raw.split(",").map((s) => s.trim());
  const out: ClubSlug[] = [];
  if (parts.includes("triaz")) out.push("triaz");
  if (parts.includes("randwijck")) out.push("randwijck");
  return out;
}

function parseBundle(raw: string | undefined): RandwijckBundleId | undefined {
  if (raw === "summer" || raw === "late_season") return raw;
  return undefined;
}

function coverageLabel(clubs: ClubSlug[], bundle: boolean): string {
  if (clubs.length === 2) return "both clubs";
  if (clubs[0] === "triaz") return "Triaz";
  return bundle ? "Randwijck (seasonal pass)" : "Randwijck";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function bundleExpiresOn(bundleId: RandwijckBundleId, today: Date): Date {
  const bundle = randwijckBundleById(bundleId);
  if (!bundle) return today;
  return new Date(Date.UTC(today.getUTCFullYear(), bundle.endMonth - 1, bundle.endDay + 1));
}

function addDaysVisual(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildJointHref(tier: MembershipTier): string {
  const params = new URLSearchParams();
  params.set("tier", tier);
  params.set("clubs", "triaz,randwijck");
  return `/portal/membership/confirm?${params.toString()}`;
}
