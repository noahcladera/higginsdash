import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { LevelCard } from "@/components/levels/level-card";
import { prisma } from "@/lib/prisma";
import { resolveAccessDetailed } from "@/lib/auth/person-access";
import {
  getStudentCriteriaWithProgress,
  listCriteriaForLevel,
  type CriterionRow,
  type CriterionWithProgress,
} from "@/lib/levels/criteria";

const VALID = new Set([
  "red_1",
  "red_2",
  "red_3",
  "orange_1",
  "orange_2",
  "orange_3",
  "green_1",
  "green_2",
  "yellow",
  "adult_beginner_beginner",
  "adult_beginner_intermediate",
  "adult_advanced_beginner",
  "adult_intermediate",
  "adult_advanced",
]);

type SkillLevelKey =
  | "red_1"
  | "red_2"
  | "red_3"
  | "orange_1"
  | "orange_2"
  | "orange_3"
  | "green_1"
  | "green_2"
  | "yellow"
  | "adult_beginner_beginner"
  | "adult_beginner_intermediate"
  | "adult_advanced_beginner"
  | "adult_intermediate"
  | "adult_advanced";

/**
 * Single-level breakdown page. Reached by clicking a child's level
 * badge on the family page (or any other in-app reference). Not in the
 * sidebar — descriptions are surfaced contextually rather than as a
 * standalone section.
 */
export default async function SingleLevelPage({
  params,
}: {
  params: Promise<{ skillLevel: string }>;
}) {
  const { skillLevel: raw } = await params;
  if (!VALID.has(raw)) notFound();
  const skillLevel = raw as SkillLevelKey;

  const row = await prisma.levelContent.findUnique({ where: { skillLevel } });
  if (!row) notFound();

  const trackHref = row.audience === "kids" ? "/levels/kids" : "/levels/adults";
  const trackLabel = row.audience === "kids" ? "All kids levels" : "All adult levels";

  // Pull the rubric for this level, plus — if the viewer is a signed-in
  // member with kids on this level — overlay each child's coach-ticked
  // progress next to each criterion.
  const baseCriteria = await listCriteriaForLevel(skillLevel);
  const access = await resolveAccessDetailed();
  let myKidsOnLevel: Array<{
    personId: string;
    displayName: string;
    criteria: CriterionWithProgress[];
  }> = [];
  if (access.state === "ok" && access.access.householdId) {
    const kids = await prisma.householdMember.findMany({
      where: {
        householdId: access.access.householdId,
        roleInHousehold: "child",
        person: {
          student: { skillLevel },
        },
      },
      select: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    myKidsOnLevel = await Promise.all(
      kids.map(async (k) => ({
        personId: k.person.id,
        displayName:
          [k.person.firstName, k.person.lastName].filter(Boolean).join(" ") ||
          "Your child",
        criteria: await getStudentCriteriaWithProgress(k.person.id, skillLevel),
      })),
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={row.audience === "kids" ? "Kids level" : "Adult level"}
        title={row.title}
        description={row.shortDescription ?? "What this level looks like on court."}
        actions={
          <Link
            href={trackHref}
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            {trackLabel} →
          </Link>
        }
      />
      <Section title="What it looks like">
        <LevelCard row={row} />
      </Section>

      {row.howToGraduate && (
        <Section
          title="How to graduate"
          description="What your child needs to show before moving up."
        >
          <p className="whitespace-pre-line text-sm text-[var(--foreground)]/80">
            {row.howToGraduate}
          </p>
        </Section>
      )}

      {baseCriteria.length > 0 && (
        <Section
          title="Graduation checklist"
          description={
            myKidsOnLevel.length > 0
              ? "Green ticks are what your coach has confirmed so far."
              : "What every student is working towards at this level."
          }
        >
          {myKidsOnLevel.length === 0 ? (
            <CriteriaList criteria={baseCriteria} />
          ) : (
            <div className="space-y-6">
              {myKidsOnLevel.map((kid) => (
                <div key={kid.personId} className="space-y-2">
                  <h3 className="text-sm font-semibold">{kid.displayName}</h3>
                  <CriteriaList criteria={kid.criteria} />
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function CriteriaList({
  criteria,
}: {
  criteria: ReadonlyArray<CriterionRow | CriterionWithProgress>;
}) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
      {criteria.map((c) => {
        const ticked =
          "achievedAt" in c && c.achievedAt != null;
        return (
          <li key={c.id} className="flex items-start gap-3 p-3">
            <span
              aria-hidden
              className={
                "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded border " +
                (ticked
                  ? "border-[var(--triaz-ink)] bg-[var(--triaz-ink)] text-white"
                  : "border-[var(--border)]")
              }
            >
              {ticked ? "✓" : ""}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{c.label}</div>
              {c.description && (
                <div className="text-xs text-[var(--muted-foreground)]">
                  {c.description}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
