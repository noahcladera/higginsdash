/**
 * BrowseAll — the step-by-step "find a class" wizard that lives below
 * the Recommended strip on `/portal/programs`.
 *
 * Server component. The current step is *derived* from URL params so
 * the URL stays shareable and the recommended hero cards keep
 * deep-linking via `?audience=...&delivery=...&school=...`.
 *
 * Steps
 * -----
 *   1. Audience            (no `audience` set)
 *   2. Format              (audience=youth, no delivery)
 *   3. School              (audience=youth, delivery=pickup, no school)
 *   4. Results             (everything else — including audience=adults
 *                           and audience=all, which skip straight here)
 *
 * Each step renders inside a `.fade-in` wrapper so the transition
 * feels like a single screen reshaping, not a hard reload.
 *
 * Removed vs. the old design (intentional):
 *   - Day, Age, Venue, free-text Search filters. They added cognitive
 *     load and weren't actually doing much for discovery.
 */

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassIcon, FamilyIcon, TrophyIcon, MapPinIcon } from "@/components/icons";
import {
  listPickupSchoolsWithSeries,
  listVisibleSeriesWithFilters,
  type AudienceFilter,
  type CatalogFilterInput,
} from "@/lib/portal/catalog-queries";
import type { ClassDeliveryMode } from "@prisma/client";
import { SeriesRow } from "./series-row";
import { WeeklyCalendar } from "./weekly-calendar";
import { WizardTile } from "./wizard-tile";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

export interface BrowseAllParams {
  /** Undefined means "user hasn't picked yet — show step 1". */
  audience?: AudienceFilter;
  delivery?: ClassDeliveryMode;
  school?: string;
}

export interface BrowseAllProps {
  params: BrowseAllParams;
  /** Whether the household has at least one child. Drives the Youth lock. */
  hasChildren: boolean;
}

type Step = 1 | 2 | 3 | 4;

function deriveStep(p: BrowseAllParams): Step {
  if (!p.audience) return 1;
  if (p.audience === "youth" && !p.delivery) return 2;
  if (p.audience === "youth" && p.delivery === "pickup" && !p.school)
    return 3;
  return 4;
}

export async function BrowseAll({ params, hasChildren }: BrowseAllProps) {
  const step = deriveStep(params);

  // The page-level <Section> now owns the "Browse all classes" title.
  // We keep the per-step subline inline so it can update as the user
  // walks the wizard without re-rendering the surrounding Section.
  const stepSubline =
    step === 1
      ? null
      : step === 2
        ? "Pick how your child should get to class."
        : step === 3
          ? "Which school should we pick up from?"
          : "Every series matching your choices, in order of start date.";

  return (
    <div className="scroll-mt-20 space-y-6">
      {stepSubline && (
        <p className="text-sm text-[var(--muted-foreground)]">{stepSubline}</p>
      )}

      {step > 1 && <Breadcrumb params={params} />}

      <div className="fade-in" key={`step-${step}-${params.audience ?? ""}-${params.delivery ?? ""}-${params.school ?? ""}`}>
        {step === 1 ? (
          <StepAudience hasChildren={hasChildren} />
        ) : step === 2 ? (
          <StepFormat />
        ) : step === 3 ? (
          <StepSchool />
        ) : (
          <StepResults params={params} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Audience
// ---------------------------------------------------------------------------

function StepAudience({ hasChildren }: { hasChildren: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <WizardTile
          href="?audience=youth#browse"
          icon={<FamilyIcon size={22} />}
          title="Youth"
          description="Group classes for kids — after-school pickups, weekend training at the club, and our high-performance program."
          locked={!hasChildren}
          lockedNote={
            <span>
              No children on this account yet.{" "}
              <Link
                href="/portal/family?addChild=1"
                className="font-semibold text-[var(--triaz-ink)] underline-offset-4 hover:underline"
              >
                Add a child
              </Link>{" "}
              to enroll one.
            </span>
          }
        />
        <WizardTile
          href="?audience=adults#browse"
          icon={<TrophyIcon size={22} />}
          title="Adults"
          description="Weekly group lessons at the club for every level — beginner, intermediate, and high intermediate."
        />
      </div>
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        Just looking around?{" "}
        <Link
          href="?audience=all#browse"
          scroll={false}
          className="font-semibold text-[var(--foreground)] underline-offset-4 hover:underline"
        >
          Browse every class →
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Format (Youth only)
// ---------------------------------------------------------------------------

async function StepFormat() {
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <WizardTile
        href="?audience=youth&delivery=at_club#browse"
        icon={<TrophyIcon size={22} />}
        title="At the club"
        description={`Weekend group ${terms.class.plural.toLowerCase()} and our high-performance program at ${brand.displayName}'s ${terms.court.plural.toLowerCase()}. ${terms.parent.plural} drop off and pick up.`}
      />
      <WizardTile
        href="?audience=youth&delivery=pickup#browse"
        icon={<MapPinIcon size={22} />}
        title="School pickup"
        description={`Our ${terms.coach.plural.toLowerCase()} collect your child straight from ${terms.school.singular.toLowerCase()} and bring them to the ${terms.court.plural.toLowerCase()}. The easiest option for busy weekdays.`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — School (Youth + Pickup only)
// ---------------------------------------------------------------------------

async function StepSchool() {
  const schools = await listPickupSchoolsWithSeries();

  if (schools.length === 0) {
    return (
      <EmptyState
        icon={<ClassIcon size={20} />}
        title="No school pickups available right now"
        description="We're not running school-pickup classes this season. Try the at-club option above, or email us if you'd like a route added for your school."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {schools.map((s) => (
        <WizardTile
          key={s.slug}
          href={`?audience=youth&delivery=pickup&school=${encodeURIComponent(s.slug)}#browse`}
          icon={<MapPinIcon size={22} />}
          title={s.name}
          description="Coaches collect from this school and bring the kids to the courts after class."
          meta={`${s.seriesCount} ${s.seriesCount === 1 ? "class" : "classes"}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Results
// ---------------------------------------------------------------------------

async function StepResults({ params }: { params: BrowseAllParams }) {
  const filters: CatalogFilterInput = {
    audience: params.audience ?? "all",
    delivery: params.delivery,
    school: params.school,
  };

  const series = await listVisibleSeriesWithFilters(filters);

  if (series.length === 0) {
    return (
      <EmptyState
        icon={<ClassIcon size={20} />}
        title="No matches"
        description={describeEmpty(params)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {series.map((s) => (
          <SeriesRow key={s.id} series={s} showProgramTag />
        ))}
      </ul>
      <WeeklyCalendar series={series} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb (steps 2+)
// ---------------------------------------------------------------------------

function Breadcrumb({ params }: { params: BrowseAllParams }) {
  // Build labelled crumbs in order, each pointing back to the URL
  // they came from (i.e. with their own param dropped).
  const crumbs: { label: string; href: string }[] = [];

  if (params.audience === "youth") {
    crumbs.push({ label: "Youth", href: "?audience=youth#browse" });
  } else if (params.audience === "adults") {
    crumbs.push({ label: "Adults", href: "?audience=adults#browse" });
  } else if (params.audience === "all") {
    crumbs.push({ label: "Everything", href: "?audience=all#browse" });
  }

  if (params.audience === "youth" && params.delivery) {
    crumbs.push({
      label: params.delivery === "pickup" ? "School pickup" : "At the club",
      href: `?audience=youth&delivery=${params.delivery}#browse`,
    });
  }

  if (
    params.audience === "youth" &&
    params.delivery === "pickup" &&
    params.school
  ) {
    crumbs.push({
      label: params.school.toUpperCase(),
      href: `?audience=youth&delivery=pickup&school=${encodeURIComponent(params.school)}#browse`,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <Link
        href="/portal/programs#browse"
        scroll={false}
        className="font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
      >
        Start over
      </Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-[var(--muted-foreground)]">/</span>
          {i === crumbs.length - 1 ? (
            <span className="font-semibold text-[var(--foreground)]">
              {c.label}
            </span>
          ) : (
            <Link
              href={c.href}
              scroll={false}
              className="text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
            >
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-state copy that mentions which choices were made
// ---------------------------------------------------------------------------

function describeEmpty(p: BrowseAllParams): string {
  const parts: string[] = [];
  if (p.audience === "youth") parts.push("youth");
  if (p.audience === "adults") parts.push("adult");
  if (p.delivery === "pickup") parts.push("school-pickup");
  if (p.delivery === "at_club") parts.push("at-club");
  if (p.school) parts.push(`for ${p.school.toUpperCase()}`);
  if (parts.length === 0) {
    return "Nothing published yet — check back soon.";
  }
  return `No ${parts.join(" / ")} classes are open right now. Try a different option from the breadcrumb above.`;
}
