/**
 * Enrollment landing page.
 *
 * The first page a parent (or adult student) sees when they decide to
 * enroll. Designed to mirror the rhythm of `/portal` and
 * `/portal/membership`:
 *
 *   1. Personalized hero ("Good afternoon, Mia.").
 *   2. Recommended programs — same component the home page uses, so a
 *      parent crossing from /portal sees a familiar layout instead of
 *      a one-off variant.
 *   3. Audience promo strip — three tinted entry tiles that deep-link
 *      into the wizard with the right filters and an honest "From €X"
 *      from the catalog.
 *   4. Browse-all wizard — Section-wrapped to match the page rhythm.
 *
 * Membership-priority badge appears only when the viewer's household
 * doesn't currently hold an active membership (rare since the portal
 * gate already permits non-members for the membership flow, but
 * covers the expired case).
 */

import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecommendedPrograms } from "@/app/portal/_components/recommended-programs";
import { getRecommendationsForViewer } from "@/lib/portal/recommend-queries";
import {
  getCheapestSeriesPriceByBucket,
  type AudienceFilter,
} from "@/lib/portal/catalog-queries";
import { getMembershipsForHousehold } from "@/lib/portal/queries";
import { getHouseholdCreditBalanceCents } from "@/lib/credits/balance";
import { CreditStrip } from "@/components/credits/credit-strip";
import type { ClassDeliveryMode } from "@prisma/client";
import { BrowseAll, type BrowseAllParams } from "./_components/browse-all";
import { AudiencePromoStrip } from "./_components/audience-promo";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

export default async function ProgramsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    audience?: string;
    delivery?: string;
    school?: string;
  }>;
}) {
  const { person, householdId } = await requireMember();
  const sp = await searchParams;

  const [recs, prices, memberships, creditBalanceCents, brand, terms] =
    await Promise.all([
      getRecommendationsForViewer(person.id, householdId),
      getCheapestSeriesPriceByBucket(),
      getMembershipsForHousehold(householdId),
      householdId ? getHouseholdCreditBalanceCents(householdId) : Promise.resolve(0),
      getCurrentBrand(),
      getTerms(),
    ]);

  const hasChildren = recs.children.length > 0;
  const isParent = hasChildren;
  const hasActiveMembership = memberships.some(
    (m) => m.status === "active" && m.daysUntilExpiry >= 0,
  );

  // The wizard derives its current step from these params. Leave
  // `audience` undefined when no choice has been made yet so Step 1
  // (the audience picker) renders — this is the whole point of the
  // step-by-step flow.
  const filters: BrowseAllParams = {
    audience: parseAudience(sp.audience),
    delivery: parseDelivery(sp.delivery),
    school: parseSchool(sp.school),
  };

  const heroGreeting = `${greetingWord()}${person.firstName ? `, ${person.firstName}` : ""}.`;
  const heroSubtitle = isParent
    ? "Pick what's next for your kids — full term price right up front, prorated if you join mid-season."
    : recs.viewerIsAdultMember || (recs.viewerAge ?? 0) >= 16
      ? "Find your level. Prices include everything."
      : "Browse what's open this season.";

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Enrollment"
        title={heroGreeting}
        description={heroSubtitle}
        actions={
          <Link
            href="#browse"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            Skip to browse →
          </Link>
        }
      />

      <CreditStrip balanceCents={creditBalanceCents} />

      {!hasActiveMembership && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--triaz-soft)] px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone="triaz">Members enroll first</Badge>
            <span className="text-[var(--foreground)]">
              Lock your spots ahead of the public window.
            </span>
          </div>
          <Button asChild tone="triaz" size="sm" variant="solid">
            <Link href="/portal/membership#buy">Get a membership →</Link>
          </Button>
        </div>
      )}

      <RecommendedPrograms
        hero={recs.hero}
        more={recs.more}
        isParent={isParent}
      />

      <Section
        title="Three quick paths in"
        description="Tap the audience that fits. We'll filter the rest down for you."
      >
        <AudiencePromoStrip prices={prices} />
      </Section>

      <Section
        id="browse"
        title={`Browse all ${terms.class.plural.toLowerCase()}`}
        description="Tell us who you're enrolling and we'll narrow it down."
      >
        <BrowseAll params={filters} hasChildren={hasChildren} />
      </Section>

      {brand.officeEmail ? (
        <Section padding="compact">
          <p className="text-xs text-[var(--muted-foreground)]">
            Looking for something not here? Email the office at{" "}
            <a
              href={`mailto:${brand.officeEmail}`}
              className="underline-offset-4 hover:underline"
            >
              {brand.officeEmail}
            </a>{" "}
            and we&apos;ll point you the right way.
          </p>
        </Section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL param parsers (mirrors the keys BrowseAll honours)
// ---------------------------------------------------------------------------

function parseAudience(raw: string | undefined): AudienceFilter | undefined {
  if (raw === "youth" || raw === "adults" || raw === "all") return raw;
  return undefined;
}
function parseDelivery(raw: string | undefined): ClassDeliveryMode | undefined {
  if (raw === "at_club" || raw === "onsite" || raw === "pickup") return raw;
  return undefined;
}
function parseSchool(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.toLowerCase().slice(0, 60);
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 6) return "Up early";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
