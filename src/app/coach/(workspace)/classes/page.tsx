import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { Section } from "@/components/ui/section";
import { GroupedSection, GroupedLinkRow } from "@/components/ui/grouped-list";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassIcon } from "@/components/icons";
import { formatPublicAgeLabel, programTargetToAudience } from "@/lib/classes/age-band";
import { getCoachClassSeriesList } from "@/lib/coach/class-series-queries";
import { formatLocalDate } from "@/lib/booking/time";
import { getTerms } from "@/lib/tenant";

export default async function CoachClassesPage() {
  const { person, allowedClubIds } = await requireCoach();
  const t = await getTerms();
  const rows = await getCoachClassSeriesList(person.id, { allowedClubIds });

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker={t.class.plural}
        title={`My ${t.class.plural.toLowerCase()}`}
        description={`Series you teach, rosters, and ${t.student.singular.toLowerCase()} skill ${t.level.plural.toLowerCase()}.`}
      />

      <Section
        title="All series"
        description={`Open a ${t.class.singular.toLowerCase()} to see the roster.`}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClassIcon />}
            title="No classes yet"
            description="When you are assigned to a class series in the admin CRM, it will appear here."
          />
        ) : (
          <>
            <div className="lg:hidden">
              <GroupedSection header="All series">
                {rows.map((s) => {
                  const ageLabel = formatPublicAgeLabel({
                    minAge: s.minAge,
                    maxAge: s.maxAge,
                    audience: programTargetToAudience(
                      s.targetAudience as "kids" | "adults" | "mixed",
                    ),
                  });
                  return (
                    <GroupedLinkRow
                      key={s.id}
                      href={`/coach/classes/${s.id}`}
                      className="flex-col items-stretch gap-1 py-3"
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {s.programName} · {audienceLabel(s.targetAudience)}
                        {ageLabel ? ` · ${ageLabel}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge variant="secondary">{s.status}</Badge>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {s.enrolledCount} enrolled
                        </span>
                      </div>
                    </GroupedLinkRow>
                  );
                })}
              </GroupedSection>
            </div>
            <ul className="hidden divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] lg:block">
            {rows.map((s) => {
              const ageLabel = formatPublicAgeLabel({
                minAge: s.minAge,
                maxAge: s.maxAge,
                audience: programTargetToAudience(
                  s.targetAudience as "kids" | "adults" | "mixed",
                ),
              });
              return (
              <li key={s.id}>
                <Link
                  href={`/coach/classes/${s.id}`}
                  className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-[var(--muted)]/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {s.programName} · {audienceLabel(s.targetAudience)}
                      {ageLabel ? ` · ${ageLabel}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{s.status}</Badge>
                    <span className="text-sm text-[var(--muted-foreground)]">
                      {formatLocalDate(s.startsOn)} – {formatLocalDate(s.endsOn)}
                    </span>
                    <span className="text-sm font-medium">
                      {s.enrolledCount} enrolled
                    </span>
                  </div>
                </Link>
              </li>
            );
            })}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}

function audienceLabel(a: string): string {
  switch (a) {
    case "kids":
      return "Kids";
    case "adults":
      return "Adults";
    default:
      return "Mixed";
  }
}
