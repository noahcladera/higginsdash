import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getAllLessonTracks } from "@/lib/medals/curriculum";

export default async function CoachLessonPlansIndexPage() {
  await requireCoach();
  const tracks = getAllLessonTracks();

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Lesson plans"
        title="Pick your age group"
        description="Structured plans you can follow on court — timed warm-ups, games, and technique blocks."
        actions={
          <Link
            href="/coach/medals"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            Medals guide
          </Link>
        }
      />

      <Section title="Tracks">
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {tracks.map((track) => (
            <li key={track.id}>
              <Link
                href={`/coach/medals/lesson-plans/${track.id}`}
                className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-[var(--muted)]/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{track.title}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">
                    {track.description}
                  </div>
                </div>
                <span className="text-sm text-[var(--muted-foreground)]">
                  Ages {track.ageRange}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
