import Link from "next/link";
import type { MedalCurriculumLevel } from "@/lib/medals/curriculum";
import { medalChipClass } from "@/lib/medals/medal-chip-colors";

export function CoachMedalLevelHeader({
  level,
}: {
  level: MedalCurriculumLevel;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex rounded-lg px-3 py-1 text-sm font-bold ${medalChipClass(level.medalLevel)}`}
        >
          {level.shortCode}
        </span>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {level.title}
        </h1>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted-foreground)]">
        <span>Ages {level.typicalAge}</span>
        <span>·</span>
        <span>Ribbon: {level.ribbonColors}</span>
      </div>
      {level.tournamentNote && (
        <p className="rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]">
          {level.tournamentNote}
        </p>
      )}
      {level.lessonTrackId && (
        <Link
          href={`/coach/medals/lesson-plans/${level.lessonTrackId}`}
          className="inline-flex text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
        >
          Open lesson plan track →
        </Link>
      )}
    </div>
  );
}
