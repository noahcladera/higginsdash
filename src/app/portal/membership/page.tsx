import Link from "next/link";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import {
  getHouseholdBuyContext,
  getHouseholdMembers,
  getMembershipsForHousehold,
  type MembershipDetail,
} from "@/lib/portal/queries";
import {
  availableUpgrades,
  coverageDescription,
  formatMembershipPrice,
  jointSavings,
  priceForTriaz,
  type ActiveMembershipSnapshot,
} from "@/lib/pricing";
import { isReturningHousehold } from "@/lib/memberships/returning";
import { clubTheme, ctaToneForContext, themeForClubs } from "@/lib/club-theme";
import { cn } from "@/lib/utils";
import { formatLongDate, randwijckStatusOn } from "@/lib/membership-seasons";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";
import { BuyMenu } from "./buy-menu";
import { UpgradeOffers } from "./upgrade-offers";
import { CoverageExplainer } from "./coverage-explainer";
import { SeasonCalendar } from "./season-calendar";
import { CancelMembershipButton } from "./_cancel-membership-button";
import { RequestStatusBadge } from "@/components/workflow/request-status-badge";
import {
  ClubTilesGrid,
  JointCrossSell,
} from "../_components/membership-pitch";
import { getMarketingImages } from "@/lib/uploads/marketing-images";
import { getHouseholdCreditBalanceCents } from "@/lib/credits/balance";
import { CreditStrip } from "@/components/credits/credit-strip";

/**
 * Membership home page. Two distinct layouts depending on whether the
 * household holds active coverage:
 *
 *   - Members (existing behaviour): page header → existing membership
 *     cards → season calendar → coverage explainer → upgrades → buy menu
 *     (collapsed). The buy menu sits at the bottom because owners
 *     usually arrive here to manage what they have.
 *
 *   - Non-members (sales mode): a punchier `PageHeader` with a "Skip to
 *     checkout" anchor → club tiles + joint upsell (the same hero used on
 *     `/portal` and `/portal/book`, kept in sync via `_components/
 *     membership-pitch`) → BuyMenu (open, anchored at `#buy`) → season
 *     calendar → coverage explainer. Buyers see structure first, then
 *     the matrix, then the small-print.
 */
export default async function PortalMembershipPage() {
  const { householdId, person } = await requireMember();

  const [memberships, members, ownership, clubs, isReturning, marketingImages, creditBalanceCents] =
    await Promise.all([
    getMembershipsForHousehold(householdId),
    getHouseholdMembers(householdId),
    getHouseholdBuyContext(householdId, person.id),
    prisma.club.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    isReturningHousehold(householdId),
    getMarketingImages(),
    householdId ? getHouseholdCreditBalanceCents(householdId) : Promise.resolve(0),
  ]);

  // Surface cancelled memberships if they were cancelled recently (last 60d)
  // so members see closure instead of the row silently vanishing.
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const visibleMemberships = memberships.filter(
    (m) =>
      m.status !== "cancelled" ||
      (m.cancelledAt && m.cancelledAt.getTime() > sixtyDaysAgo),
  );
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const hasActive = activeMemberships.length > 0;

  const activeSnapshot: ActiveMembershipSnapshot[] = activeMemberships.map(
    (m) => ({
      id: m.id,
      coverageTier: m.coverageTier,
      clubSlugs: m.clubSlugs,
      pricePaid: m.pricePaid,
    }),
  );
  const allOffers = availableUpgrades({
    active: activeSnapshot,
    ctx: { isReturning: true },
  });

  const randwijck = randwijckStatusOn();
  const offers = randwijck.isOpen
    ? allOffers
    : allOffers.filter((o) => !o.target.clubs.includes("randwijck"));

  if (!hasActive) {
    return (
      <NonMemberMembershipView
        clubs={clubs}
        randwijckOpen={randwijck.isOpen}
        randwijckReopensLabel={formatLongDate(randwijck.upcoming.startsOn)}
        ownership={ownership}
        isReturning={isReturning}
        marketingImages={marketingImages}
        creditBalanceCents={creditBalanceCents}
      />
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Membership"
        title="Your memberships"
        description="What you cover today, how memberships work, and how to add more."
      />

      <CreditStrip balanceCents={creditBalanceCents} />

      {visibleMemberships.length > 0 && (
        <div className="space-y-4">
          {visibleMemberships.map((m) => (
            <MembershipCard
              key={m.id}
              membership={m}
              members={members}
              marketingImages={marketingImages}
            />
          ))}
        </div>
      )}

      <Section
        title="Season calendar"
        description="Triaz runs year-round in two halves. Randwijck is summer-only."
      >
        <SeasonCalendar />
      </Section>

      <Section
        title="How memberships work"
        description="The full pricing matrix and what each option covers."
      >
        <CoverageExplainer />
      </Section>

      {offers.length > 0 && (
        <Section
          title="Upgrade options"
          description="We credit what you've already paid; you only owe the difference."
        >
          <UpgradeOffers offers={offers} />
        </Section>
      )}

      <Section
        id="buy"
        title="Buy more coverage"
        description="Add a club, family membership, or another tier."
      >
        <BuyMenu
          collapsedByDefault={true}
          randwijckOpen={randwijck.isOpen}
          randwijckReopensLabel={formatLongDate(randwijck.upcoming.startsOn)}
          ownership={ownership}
          isReturning={isReturning}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-member layout — sells before it explains.
// ---------------------------------------------------------------------------

function NonMemberMembershipView({
  clubs,
  randwijckOpen,
  randwijckReopensLabel,
  ownership,
  isReturning,
  marketingImages = {},
  creditBalanceCents = 0,
}: {
  clubs: { id: string; name: string; slug: string }[];
  randwijckOpen: boolean;
  randwijckReopensLabel: string;
  ownership: Awaited<ReturnType<typeof getHouseholdBuyContext>>;
  isReturning: boolean;
  marketingImages?: Record<string, string>;
  creditBalanceCents?: number;
}) {
  const known = clubs.filter(
    (c) => c.slug === "triaz" || c.slug === "randwijck",
  );
  const adultJointSaving = jointSavings("adult", { isReturning: true });
  const fromAdult = formatMembershipPrice(
    priceForTriaz({ tier: "adult", ctx: { isReturning: true } }),
  );

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Memberships"
        title="Pick yours."
        description={`Two clubs, three tiers. From ${fromAdult} a year — and one membership covers the whole household if you go family.`}
        actions={
          <Button asChild tone="triaz" size="sm">
            <Link href="#buy">
              Skip to checkout <ArrowRightIcon size={14} />
            </Link>
          </Button>
        }
      />

      <CreditStrip balanceCents={creditBalanceCents} />

      <Section
        id="buy"
        title="Pick a tier"
        description="Three tiers across three coverage shapes. The buy menu picks who it's for and locks the price."
      >
        <BuyMenu
          collapsedByDefault={false}
          randwijckOpen={randwijckOpen}
          randwijckReopensLabel={randwijckReopensLabel}
          ownership={ownership}
          isReturning={isReturning}
        />
      </Section>

      <Section
        title="Pick a home"
        description="Each membership covers one club. Cover both for a joint discount."
      >
        <div className="space-y-5">
          {known.length === 2 && <JointCrossSell saving={adultJointSaving} />}
          <ClubTilesGrid clubs={clubs} marketingImages={marketingImages} />
        </div>
      </Section>

      <details className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">How pricing works</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Tiers, joint discount, and what each option covers
              </div>
            </div>
            <ArrowRightIcon
              size={16}
              className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-90"
            />
          </div>
        </summary>
        <div className="border-t border-[var(--border)] px-5 pb-5 pt-4">
          <CoverageExplainer collapseProration includeClubCards={false} />
        </div>
      </details>

      <details className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
        <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Club details</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Season calendar, court hours, and booking rules
              </div>
            </div>
            <ArrowRightIcon
              size={16}
              className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-90"
            />
          </div>
        </summary>
        <div className="space-y-6 border-t border-[var(--border)] px-5 pb-5 pt-4">
          <SeasonCalendar />
          <CoverageExplainer clubCardsOnly />
        </div>
      </details>
    </div>
  );
}

function MembershipCard({
  membership,
  members,
  marketingImages = {},
}: {
  membership: MembershipDetail;
  members: { firstName: string; lastName: string; role: "adult" | "child" }[];
  marketingImages?: Record<string, string>;
}) {
  const statusInfo = computeStatus(membership);
  const theme = clubTheme(themeForClubs(membership.clubSlugs));
  const tierImageUrl = marketingImages[`tier:${membership.coverageTier}`];

  const covers =
    membership.coverageTier === "family"
      ? members.map((m) => `${m.firstName} ${m.lastName}`.trim()).filter(Boolean)
      : [membership.assignedPersonName ?? "Adult (household)"];

  return (
    <article
      className="fade-in relative overflow-hidden elev-card p-6"
      style={{
        backgroundImage: `linear-gradient(90deg, ${theme.rawColor} 0, ${theme.rawColor} 4px, transparent 4px)`,
      }}
    >
      {tierImageUrl && (
        <div className="relative mb-4 aspect-[16/7] w-full overflow-hidden rounded-[var(--radius-md)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tierImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge tone={themeForClubs(membership.clubSlugs)} variant="soft">
            {theme.label}
          </Badge>
          <h2 className="font-display text-2xl font-medium tracking-tight">
            {coverageDescription({
              tier: membership.coverageTier,
              clubs: membership.clubSlugs,
            })}
          </h2>
          {membership.coverageTier !== "family" && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Assigned to {membership.assignedPersonName ?? "Adult (household)"}
            </p>
          )}
          <div className="text-sm text-[var(--muted-foreground)]">
            <span className="tabular">
              Active until{" "}
              <span className="font-medium text-[var(--foreground)]">
                {formatDate(membership.expiresOn)}
              </span>
            </span>
            <span className="mx-2 opacity-50">·</span>
            <span className="tabular">
              started {formatDate(membership.startsOn)}
            </span>
            {membership.pricePaid != null && (
              <>
                <span className="mx-2 opacity-50">·</span>
                <span className="tabular">
                  paid {formatMembershipPrice(membership.pricePaid)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            tone={
              statusInfo.tone === "ok"
                ? "success"
                : statusInfo.tone === "warn"
                  ? "warning"
                  : statusInfo.tone === "danger"
                    ? "danger"
                    : "neutral"
            }
          >
            {statusInfo.label}
          </Badge>
          {membership.cancellationRequestedAt && membership.status === "active" && (
            <RequestStatusBadge status="pending" />
          )}
        </div>
      </div>

      {membership.cancellationRequestedAt && membership.status === "active" && (
        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-4 py-3 text-sm">
          <div className="font-medium">Cancellation pending review</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            Filed {formatDate(membership.cancellationRequestedAt)} ·{" "}
            <span className="italic">
              "{membership.cancellationRequestedReason}"
            </span>
          </div>
        </div>
      )}

      {membership.status === "cancelled" && membership.cancelledAt && (
        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-strong)] px-4 py-3 text-sm">
          <div className="font-medium">Cancelled on {formatDate(membership.cancelledAt)}</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            Coverage ended. Contact the office to start a new membership.
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-medium text-[var(--foreground)]/80">
            Clubs covered
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {membership.clubs.length === 0 ? (
              <span className="text-sm text-[var(--muted-foreground)]">
                None
              </span>
            ) : (
              membership.clubs.map((c) => (
                <Badge
                  key={c.id}
                  tone={
                    c.slug === "randwijck"
                      ? "randwijck"
                      : c.slug === "triaz"
                        ? "triaz"
                        : "neutral"
                  }
                  variant="soft"
                >
                  {c.name}
                </Badge>
              ))
            )}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium text-[var(--foreground)]/80">
            Who&apos;s covered
          </h3>
          <p className="mt-2 text-sm text-[var(--foreground)]">
            {covers.length === 0 ? "Membership holder" : covers.join(", ")}
          </p>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <p className="text-xs text-[var(--muted-foreground)]">
          {membership.daysUntilExpiry <= 30
            ? "Your term ends soon — renew or change coverage from the buy menu below."
            : "Renew or add coverage any time from the buy menu below."}
        </p>
        <div className="flex items-center gap-1">
          {membership.status === "active" &&
            !membership.cancellationRequestedAt && (
              <CancelMembershipButton
                membershipId={membership.id}
                expiresOnLabel={formatDate(membership.expiresOn)}
              />
            )}
          <Link
            href="#buy"
            title="Renew or change your coverage"
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90",
              theme.buttonBg,
            )}
          >
            Renew
          </Link>
        </div>
      </div>
    </article>
  );
}

function computeStatus(m: MembershipDetail): {
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral";
} {
  if (m.status !== "active") {
    return { label: cap(m.status), tone: "neutral" };
  }
  if (m.daysUntilExpiry < 0) {
    return { label: "Expired", tone: "danger" };
  }
  if (m.daysUntilExpiry <= 30) {
    return {
      label: `Expires in ${m.daysUntilExpiry} day${m.daysUntilExpiry === 1 ? "" : "s"}`,
      tone: "warn",
    };
  }
  return { label: "Active", tone: "ok" };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
