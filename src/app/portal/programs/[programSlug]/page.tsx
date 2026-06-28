import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";
import { PortalPageHeader } from "@/components/portal/portal-page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { BackLink } from "@/components/ui/back-link";
import { GroupedSection } from "@/components/ui/grouped-list";
import { ClassIcon } from "@/components/icons";
import {
  getProgramBySlug,
  listVisibleSeriesForProgram,
} from "@/lib/portal/catalog-queries";
import { getRecommendationContext } from "@/lib/portal/recommend-queries";
import { cn } from "@/lib/utils";
import { isOpenEndedAdultMax } from "@/lib/classes/age-band";
import { SeriesRow } from "../_components/series-row";
import { CoverImage } from "@/components/portal/cover-image";
import { stripStubPrefix } from "@/lib/classes/clean-text";

/**
 * Series list for one program. Filters surface from the URL so a parent
 * can deep-link a friend ("here are the BSA pickup classes for Mia").
 *
 * Filters: ?day=mon&age=8&school=bsa
 *   - day: "mon" | "tue" | … (drop unmatched)
 *   - age: integer; keeps series whose [minAge,maxAge] window includes it
 *   - school: lowercase slug; keeps series tied to that school OR
 *             school-agnostic ones for kids who attend it as well
 */
export default async function ProgramSeriesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ programSlug: string }>;
  searchParams: Promise<{ day?: string; age?: string; school?: string }>;
}) {
  const { person, householdId } = await requireMember();
  const { programSlug } = await params;
  const sp = await searchParams;

  // Events have a dedicated portal surface with the right layout.
  if (programSlug === "events" && !sp.day && !sp.age && !sp.school) {
    redirect("/portal/events");
  }

  const program = await getProgramBySlug(programSlug);
  if (!program || !program.isActive || !program.isPubliclyListed) {
    notFound();
  }

  const [series, ctx] = await Promise.all([
    listVisibleSeriesForProgram(programSlug),
    getRecommendationContext(person.id, householdId),
  ]);

  // Adult programs: child-derived filters (age / school) are not meaningful,
  // so we drop them from both the URL and the UI. `mixed` keeps them, since
  // a household could be browsing on behalf of a kid.
  const isAdultsOnly = program.targetAudience === "adults";

  const dayFilter = parseDay(sp.day);
  const ageFilter = isAdultsOnly ? null : parseAge(sp.age);
  const schoolFilter = isAdultsOnly ? null : parseSchool(sp.school);

  const filtered = series.filter((s) => {
    if (dayFilter && s.dayOfWeek !== dayFilter) return false;
    if (ageFilter != null) {
      if (s.minAge != null && ageFilter < s.minAge) return false;
      if (
        s.maxAge != null &&
        !isOpenEndedAdultMax(s.maxAge) &&
        ageFilter > s.maxAge
      ) {
        return false;
      }
    }
    if (schoolFilter) {
      // School-tagged series only match exact school; non-tagged series
      // pass through (everyone is welcome).
      if (s.schoolSlug && s.schoolSlug !== schoolFilter) return false;
    }
    return true;
  });

  const childAges = isAdultsOnly
    ? []
    : ctx.children
        .map((c) => c.age)
        .filter((a): a is number => a != null);
  const childSchools = isAdultsOnly
    ? []
    : Array.from(
        new Set(
          ctx.children
            .map((c) => c.schoolSlug)
            .filter((s): s is string => typeof s === "string"),
        ),
      );

  return (
    <div className="space-y-10">
      <BackLink href="/portal/programs" label="All programs" />

      {program.coverImageUrl && (
        <CoverImage
          src={program.coverImageUrl}
          alt={program.name}
          focusY={program.coverImageFocusY}
          className="shadow-[var(--shadow-sm)]"
        />
      )}

      <PortalPageHeader
        kicker="Lessons"
        title={program.name}
        description={
          stripStubPrefix(program.descriptionPublic) ??
          "Pick the time that fits your week and we'll save you a spot."
        }
      />

      <FilterBar
        programSlug={programSlug}
        currentDay={dayFilter}
        currentAge={ageFilter}
        currentSchool={schoolFilter}
        suggestedAges={childAges}
        suggestedSchools={childSchools}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClassIcon size={20} />}
          title="No matching series"
          description={
            series.length === 0
              ? "Nothing published yet for this program — check back soon."
              : "Try clearing the filters above."
          }
        />
      ) : (
        <GroupedSection>
          {filtered.map((s) => (
            <SeriesRow key={s.id} series={s} />
          ))}
        </GroupedSection>
      )}
    </div>
  );
}

function FilterBar({
  programSlug,
  currentDay,
  currentAge,
  currentSchool,
  suggestedAges,
  suggestedSchools,
}: {
  programSlug: string;
  currentDay: string | null;
  currentAge: number | null;
  currentSchool: string | null;
  suggestedAges: number[];
  suggestedSchools: string[];
}) {
  const baseHref = `/portal/programs/${programSlug}`;
  const buildHref = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams();
    if (currentDay) next.set("day", currentDay);
    if (currentAge != null) next.set("age", String(currentAge));
    if (currentSchool) next.set("school", currentSchool);
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const days: { key: string; label: string }[] = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ];
  const hasAny = currentDay || currentAge != null || currentSchool;

  return (
    <div className="grouped-section flex flex-col gap-4 p-4 md:elev-card">
      <FilterRow label="Day">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => (
            <Pill
              key={d.key}
              href={buildHref({ day: currentDay === d.key ? null : d.key })}
              active={currentDay === d.key}
            >
              {d.label}
            </Pill>
          ))}
        </div>
      </FilterRow>
      {suggestedAges.length > 0 && (
        <FilterRow label="Child's age">
          <div className="flex flex-wrap gap-1.5">
            {suggestedAges.map((a) => (
              <Pill
                key={a}
                href={buildHref({
                  age: currentAge === a ? null : String(a),
                })}
                active={currentAge === a}
              >
                {a}
              </Pill>
            ))}
          </div>
        </FilterRow>
      )}
      {suggestedSchools.length > 0 && (
        <FilterRow label="School">
          <div className="flex flex-wrap gap-1.5">
            {suggestedSchools.map((s) => (
              <Pill
                key={s}
                href={buildHref({ school: currentSchool === s ? null : s })}
                active={currentSchool === s}
              >
                {s.toUpperCase()}
              </Pill>
            ))}
          </div>
        </FilterRow>
      )}
      {hasAny && (
        <div className="text-xs">
          <Link
            href={baseHref}
            className="text-[var(--muted-foreground)] underline-offset-4 hover:underline"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="grouped-section-header px-0 normal-case tracking-normal text-sm font-medium">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[var(--triaz)] bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
          : "border-[var(--content-separator)] bg-transparent text-[var(--muted-foreground)] hover:border-[var(--triaz)]/40 hover:text-[var(--foreground)]",
      )}
    >
      {children}
    </Link>
  );
}

function parseDay(raw: string | undefined): string | null {
  const valid = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  if (raw && valid.includes(raw)) return raw;
  return null;
}
function parseAge(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 99 ? Math.floor(n) : null;
}
function parseSchool(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.toLowerCase().slice(0, 60);
}
