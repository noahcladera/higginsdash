import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { CheckpointGrid } from "@/components/medals/coach/checkpoint-grid";
import { CoachMedalLevelHeader } from "@/components/medals/coach/coach-medal-level-header";
import { CoachMedalSummary } from "@/components/medals/coach/coach-medal-summary";
import { MedalLadderStrip } from "@/components/medals/coach/medal-ladder-strip";
import { PdfViewerLink } from "@/components/medals/coach/pdf-viewer-link";
import {
  CURRICULUM_PDFS,
  getMedalCurriculum,
  isMedalLevel,
} from "@/lib/medals/curriculum";
import { getNextMedalLevel, formatMedalLevel } from "@/lib/medal-levels";
import { getCoachMedalsReport } from "@/lib/medals/coach-medals-report";

export default async function CoachMedalLevelPage({
  params,
}: {
  params: Promise<{ medalLevel: string }>;
}) {
  const { medalLevel: raw } = await params;
  if (!isMedalLevel(raw)) notFound();

  const { person } = await requireCoach();
  const level = getMedalCurriculum(raw);
  const report = await getCoachMedalsReport({ coachPersonId: person.id });
  const myRow = report[0] ?? null;

  const next = getNextMedalLevel(raw);
  const pdfHref =
    raw === "green_1" || raw === "green_2"
      ? CURRICULUM_PDFS.greenSilverRequirements
      : CURRICULUM_PDFS.yellowOrangeRequirements;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Medal level"
        title={level.title}
        actions={
          <Link
            href="/coach/medals"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            All levels
          </Link>
        }
      />

      <CoachMedalLevelHeader level={level} />

      <Section title="Checkpoint requirements">
        <CheckpointGrid level={level} />
      </Section>

      <Section title="Graduating to the next level">
        <p className="text-sm leading-relaxed">{level.graduateTo}</p>
        {next && (
          <Link
            href={`/coach/medals/${next}`}
            className="mt-2 inline-block text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            View {formatMedalLevel(next)} requirements →
          </Link>
        )}
      </Section>

      {level.technicalFocus.length > 0 && (
        <Section title="Technical focus">
          <ul className="list-inside list-disc space-y-1 text-sm">
            {level.technicalFocus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {level.drills.length > 0 && (
        <Section title="Drills & games">
          <ul className="list-inside list-disc space-y-1 text-sm">
            {level.drills.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your students">
        <CoachMedalSummary row={myRow} filterMedal={raw} />
      </Section>

      <Section title="Requirements sheet">
        <PdfViewerLink href={pdfHref} label="Open full requirements PDF" />
      </Section>

      <Section title="Ladder">
        <MedalLadderStrip activeLevel={raw} />
      </Section>
    </div>
  );
}
