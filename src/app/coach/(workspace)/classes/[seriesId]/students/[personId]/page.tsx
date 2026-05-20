import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import {
  getCoachSeriesWithRoster,
  getStudentHouseholdAdults,
  getCoachOtherSeriesForStudent,
} from "@/lib/coach/class-series-queries";
import {
  formatSkillLevel,
  getNextSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import { CoachLevelSelect } from "../../coach-level-select";
import { getStudentContacts } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand } from "@/lib/tenant";
import { getStudentCriteriaWithProgress } from "@/lib/levels/criteria";
import { prisma } from "@/lib/prisma";
import {
  promoteStudent,
  toggleCriterion,
} from "@/lib/levels/progress-actions";

export default async function CoachStudentProfilePage({
  params,
}: {
  params: Promise<{ seriesId: string; personId: string }>;
}) {
  const { seriesId, personId } = await params;
  const { person: coach, allowedClubIds } = await requireCoach();
  const brand = await getCurrentBrand();

  const series = await getCoachSeriesWithRoster(coach.id, seriesId, {
    allowedClubIds,
  });
  if (!series) notFound();

  const enrolled = series.enrollments.some(
    (e) =>
      e.studentPersonId === personId &&
      (e.status === "active" || e.status === "waitlist"),
  );
  if (!enrolled) notFound();

  const row = series.enrollments.find((e) => e.studentPersonId === personId);
  if (!row) notFound();

  const p = row.student.person;
  const displayName =
    [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Student";
  const sl = row.student.skillLevel as SkillLevelValue | null;

  const [household, otherSeries, contactGroup, criteria, skillHistory] =
    await Promise.all([
      getStudentHouseholdAdults(personId),
      getCoachOtherSeriesForStudent(coach.id, personId, seriesId, {
        allowedClubIds,
      }),
      getStudentContacts(personId),
      sl
        ? getStudentCriteriaWithProgress(personId, sl)
        : Promise.resolve(
            [] as Awaited<ReturnType<typeof getStudentCriteriaWithProgress>>,
          ),
      prisma.studentSkillHistory.findMany({
        where: { studentId: personId },
        orderBy: { changedAt: "desc" },
        take: 10,
        select: {
          id: true,
          fromLevel: true,
          toLevel: true,
          changedAt: true,
          reason: true,
          changedByPerson: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

  const totalCriteria = criteria.length;
  const achievedCriteria = criteria.filter((c) => c.achievedAt != null).length;
  const allTicked = totalCriteria > 0 && achievedCriteria === totalCriteria;
  const nextLevel = getNextSkillLevel(sl);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Student"
        title={displayName}
        description={
          <>
            {series.name} · Current level:{" "}
            <span className="font-medium">{formatSkillLevel(sl)}</span>
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            {contactGroup && contactGroup.targets.length > 0 && (
              <ContactButton
                group={contactGroup}
                subjectName={displayName}
                brandName={brand.shortName}
                size="sm"
              />
            )}
            <Link
              href={`/coach/classes/${seriesId}`}
              className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
            >
              Back to roster
            </Link>
          </div>
        }
      />

      <Section title="Skill level" description="Visible to coaches for this class.">
        <CoachLevelSelect
          classSeriesId={seriesId}
          studentPersonId={personId}
          level={sl}
        />
      </Section>

      <Section
        title="Progression"
        description={
          sl
            ? `Tick what ${displayName.split(" ")[0]} can do today. When the list is full, you can move them up.`
            : `Set a skill level above to start ticking criteria.`
        }
      >
        {!sl ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No level set yet.
          </p>
        ) : totalCriteria === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No criteria configured for {formatSkillLevel(sl)} yet.{" "}
            <Link
              href={`/admin/settings/levels/${sl}`}
              className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
            >
              Add some
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]"
                aria-label={`${achievedCriteria} of ${totalCriteria} criteria ticked`}
              >
                <div
                  className="h-full rounded-full bg-[var(--triaz-ink)]"
                  style={{
                    width: `${Math.round((achievedCriteria / totalCriteria) * 100)}%`,
                  }}
                />
              </div>
              <span className="tabular-nums text-[var(--muted-foreground)]">
                {achievedCriteria} / {totalCriteria}
              </span>
            </div>

            <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
              {criteria.map((c) => {
                const ticked = c.achievedAt != null;
                return (
                  <li key={c.id} className="flex items-start gap-3 p-3">
                    <form action={toggleCriterion} className="contents">
                      <input
                        type="hidden"
                        name="studentPersonId"
                        value={personId}
                      />
                      <input
                        type="hidden"
                        name="classSeriesId"
                        value={seriesId}
                      />
                      <input
                        type="hidden"
                        name="criterionId"
                        value={c.id}
                      />
                      <input
                        type="hidden"
                        name="achieved"
                        value={ticked ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        aria-pressed={ticked}
                        aria-label={
                          ticked
                            ? `Un-tick: ${c.label}`
                            : `Tick: ${c.label}`
                        }
                        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded border ${
                          ticked
                            ? "border-[var(--triaz-ink)] bg-[var(--triaz-ink)] text-white"
                            : "border-[var(--border)] bg-transparent"
                        }`}
                      >
                        {ticked ? "✓" : ""}
                      </button>
                    </form>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.label}</div>
                      {c.description && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {c.description}
                        </div>
                      )}
                      {ticked && c.achievedAt && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Ticked {c.achievedAt.toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {nextLevel && (
              <form action={promoteStudent} className="flex items-center gap-3">
                <input
                  type="hidden"
                  name="studentPersonId"
                  value={personId}
                />
                <input
                  type="hidden"
                  name="classSeriesId"
                  value={seriesId}
                />
                <Button type="submit" disabled={!allTicked}>
                  Promote to {formatSkillLevel(nextLevel)}
                </Button>
                {!allTicked && (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    Tick every criterion to enable.
                  </span>
                )}
              </form>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Skill history"
        description="Most recent level changes for this student."
      >
        {skillHistory.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No skill changes recorded yet.
          </p>
        ) : (
          <ol className="space-y-2 text-sm">
            {skillHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {h.changedAt.toLocaleDateString()}
                </span>
                <span>
                  {formatSkillLevel(h.fromLevel)} →{" "}
                  <span className="font-medium">
                    {formatSkillLevel(h.toLevel)}
                  </span>
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  by{" "}
                  {[h.changedByPerson?.firstName, h.changedByPerson?.lastName]
                    .filter(Boolean)
                    .join(" ") || "system"}
                  {h.reason ? ` · ${h.reason.replaceAll("_", " ")}` : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        title="Household & contacts"
        description="Parents and guardians on file (read-only)."
      >
        {household.adults.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No household on file for this student.
          </p>
        ) : (
          <div className="space-y-4">
            {household.householdName && (
              <p className="text-sm font-medium">{household.householdName}</p>
            )}
            <ul className="space-y-3">
              {household.adults.map((a) => (
                <li
                  key={a.personId}
                  className="rounded-md border border-[var(--border)] px-4 py-3"
                >
                  <div className="font-medium">
                    {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                  </div>
                  {a.phone && (
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {a.phone}
                    </div>
                  )}
                  {a.emails.map((em) => (
                    <div
                      key={em.address}
                      className="text-sm text-[var(--muted-foreground)]"
                    >
                      {em.address}
                      {em.isPrimary ? " · primary" : ""}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {otherSeries.length > 0 && (
        <Section
          title="Your other classes with this student"
          description="Enrollments in other series you coach."
        >
          <ul className="list-inside list-disc text-sm">
            {otherSeries.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/coach/classes/${s.id}`}
                  className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                >
                  {s.name}
                </Link>{" "}
                <span className="text-[var(--muted-foreground)]">({s.status})</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
