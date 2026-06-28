import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { Section } from "@/components/ui/section";
import { LessonPlanPicker } from "@/components/medals/coach/lesson-plan-picker";
import { PdfViewerLink } from "@/components/medals/coach/pdf-viewer-link";
import {
  getLessonTrack,
  isLessonTrackId,
  OLDER_GAMES,
  YOUNGER_GAMES,
} from "@/lib/medals/curriculum";

export default async function CoachLessonPlanTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  await requireCoach();
  const { track: raw } = await params;
  if (!isLessonTrackId(raw)) notFound();

  const track = getLessonTrack(raw);
  if (!track) notFound();

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker="Lesson plans"
        title={track.title}
        description={track.description}
        actions={
          <Link
            href="/coach/medals/lesson-plans"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            All tracks
          </Link>
        }
      />

      {track.lessons && track.lessons.length > 0 && (
        <Section title="Week by week" description={`Ages ${track.ageRange}`}>
          <LessonPlanPicker lessons={track.lessons} />
        </Section>
      )}

      {track.imagePaths && track.imagePaths.length > 0 && (
        <Section title="Print & take on court">
          <div className="grid gap-6 lg:grid-cols-2">
            {track.imagePaths.map((src, i) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-xl border border-[var(--border)]"
              >
                <Image
                  src={src}
                  alt={`Lesson plan ${i + 1}`}
                  width={1200}
                  height={1600}
                  className="h-auto w-full"
                />
              </a>
            ))}
          </div>
        </Section>
      )}

      {track.serveProgressions && (
        <Section title="Serve progressions & medal requirements">
          <ul className="mb-4 list-inside list-disc space-y-1 text-sm">
            {track.serveProgressions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {track.pdfPath && (
            <PdfViewerLink
              href={track.pdfPath}
              label="Blue 2 – Red 2 lesson plans PDF"
              embed
            />
          )}
        </Section>
      )}

      {raw === "ages-4-7" && (
        <>
          <Section title="Game library — younger kids">
            <p className="text-sm text-[var(--muted-foreground)]">
              {YOUNGER_GAMES.join(" · ")}
            </p>
          </Section>
          <Section title="Game library — older / more skilled">
            <p className="text-sm text-[var(--muted-foreground)]">
              {OLDER_GAMES.join(" · ")}
            </p>
          </Section>
          {track.pdfPath && (
            <Section title="Full typed lesson plan (PDF)">
              <PdfViewerLink
                href={track.pdfPath}
                label="Ages 4–7 typed lesson plan"
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
