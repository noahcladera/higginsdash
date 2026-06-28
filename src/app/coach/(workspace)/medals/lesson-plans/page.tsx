import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { Section } from "@/components/ui/section";
import { LessonTrackCards } from "@/components/medals/coach/lesson-track-cards";

export default async function CoachLessonPlansIndexPage() {
  await requireCoach();

  return (
    <div className="space-y-10">
      <ShellPageHeader
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
        <LessonTrackCards />
      </Section>
    </div>
  );
}
