import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CeremonyChecklist } from "@/components/medals/coach/ceremony-checklist";
import { CoachMedalSummary } from "@/components/medals/coach/coach-medal-summary";
import { LessonTrackCards } from "@/components/medals/coach/lesson-track-cards";
import { MedalLadderStrip } from "@/components/medals/coach/medal-ladder-strip";
import { MedalQuickStart } from "@/components/medals/coach/medal-quick-start";
import { ReferenceLinks } from "@/components/medals/coach/pdf-viewer-link";
import { FIVE_SKILLS, REFERENCE_VIDEOS, youtubeWatchUrl } from "@/lib/medals/curriculum";
import { getCoachMedalsReport } from "@/lib/medals/coach-medals-report";

export default async function CoachMedalsHubPage() {
  const { person } = await requireCoach();
  const report = await getCoachMedalsReport({ coachPersonId: person.id });
  const myRow = report[0] ?? null;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Curriculum"
        title="Medals guide"
        description="Everything you need to run medals season — levels, lesson plans, and your roster totals."
      />

      <Section title="Your assignments this season">
        <CoachMedalSummary row={myRow} />
      </Section>

      <Section
        title="Quick start"
        description="New coach? Follow these four steps every season."
      >
        <MedalQuickStart />
      </Section>

      <Section
        title="Medal ladder"
        description="Click any level for checkpoint requirements, drills, and ribbon colors."
      >
        <MedalLadderStrip />
      </Section>

      <Section
        title="How medals work"
        description="Every medal is built from five skill areas."
      >
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIVE_SKILLS.map((skill, i) => (
            <li
              key={skill.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <span className="text-xs font-semibold text-[var(--triaz-ink)]">
                {i + 1}. {skill.title}
              </span>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {skill.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Lesson plans"
        description="Interactive week-by-week plans — take them on court."
      >
        <LessonTrackCards />
      </Section>

      <Section
        title="Medals day checklist"
        description="Last class: checkpoints, counts, ceremony."
      >
        <CeremonyChecklist id="ceremony" />
      </Section>

      <Section title="Reference videos">
        <ul className="space-y-2 text-sm">
          {REFERENCE_VIDEOS.map((v) => (
            <li key={v.id}>
              <a
                href={youtubeWatchUrl(v.youtubeId)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
              >
                {v.title}
              </a>
              <span className="text-[var(--muted-foreground)]">
                {" "}
                · ages {v.ageRange}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="PDF reference sheets">
        <ReferenceLinks />
      </Section>
    </div>
  );
}
