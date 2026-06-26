import Link from "next/link";
import { getAllLessonTracks } from "@/lib/medals/curriculum";

export function LessonTrackCards() {
  const tracks = getAllLessonTracks();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tracks.map((track) => (
        <Link
          key={track.id}
          href={`/coach/medals/lesson-plans/${track.id}`}
          className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:border-[var(--triaz-ink)]/40 hover:shadow-sm"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Ages {track.ageRange}
          </div>
          <h3 className="mt-1 font-display text-lg font-medium group-hover:text-[var(--triaz-ink)]">
            {track.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {track.description}
          </p>
        </Link>
      ))}
    </div>
  );
}
