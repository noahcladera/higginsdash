import Link from "next/link";
import { getAllLessonTracks } from "@/lib/medals/curriculum";
import { GroupedSection, GroupedLinkRow } from "@/components/ui/grouped-list";

export function LessonTrackCards() {
  const tracks = getAllLessonTracks();
  return (
    <>
      <div className="lg:hidden">
        <GroupedSection header="Lesson plan tracks">
          {tracks.map((track) => (
            <GroupedLinkRow
              key={track.id}
              href={`/coach/medals/lesson-plans/${track.id}`}
              className="flex-col items-stretch gap-1 py-3"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Ages {track.ageRange}
              </span>
              <span className="font-display text-base font-medium">
                {track.title}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">
                {track.description}
              </span>
            </GroupedLinkRow>
          ))}
        </GroupedSection>
      </div>

      <div className="hidden gap-4 sm:grid-cols-3 lg:grid">
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
    </>
  );
}
