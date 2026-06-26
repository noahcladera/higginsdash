"use client";

import { useMemo, useState } from "react";
import type { LessonPlanWeek } from "@/lib/medals/curriculum";
import { lessonMinutesTotal } from "@/lib/medals/curriculum";
import { cn } from "@/lib/utils";

export function LessonPlanPicker({ lessons }: { lessons: LessonPlanWeek[] }) {
  const [active, setActive] = useState(0);
  const lesson = lessons[active];
  const totalMinutes = useMemo(
    () => (lesson ? lessonMinutesTotal(lesson) : 0),
    [lesson],
  );

  if (!lesson) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {lessons.map((l, i) => (
          <button
            key={l.lessonNumber}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              i === active
                ? "border-[var(--triaz-ink)] bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
                : "border-[var(--border)] hover:bg-[var(--muted)]/40",
            )}
          >
            {l.lessonNumber}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-medium">{lesson.title}</h3>
          <span className="text-sm text-[var(--muted-foreground)]">
            {lesson.duration}
            {totalMinutes > 0 ? ` · ~${totalMinutes} min planned` : ""}
          </span>
        </div>
        {lesson.notes && (
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {lesson.notes}
          </p>
        )}
        {lesson.lessonNumber >= 12 && (
          <p className="mt-3 rounded-lg bg-[var(--triaz-soft)] px-3 py-2 text-sm font-medium text-[var(--triaz-ink)]">
            Final week: run the medals check in the last 15 minutes. See the{" "}
            <a href="/coach/medals#ceremony" className="underline">
              ceremony checklist
            </a>
            .
          </p>
        )}

        <div className="mt-6 space-y-4">
          {lesson.blocks.map((block) => (
            <details key={block.phase} open className="group">
              <summary className="cursor-pointer list-none font-medium">
                <span className="inline-flex items-center gap-2">
                  <span className="text-[var(--triaz-ink)]">▸</span>
                  {block.phase}
                </span>
              </summary>
              <ul className="mt-2 space-y-1 border-l-2 border-[var(--border)] pl-4">
                {block.items.map((item) => (
                  <li
                    key={item.name}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-1 text-sm"
                  >
                    <span>{item.name}</span>
                    <span className="tabular-nums text-[var(--muted-foreground)]">
                      {item.minutes != null ? `${item.minutes} min` : item.note}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
