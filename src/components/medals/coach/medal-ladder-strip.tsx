"use client";

import Link from "next/link";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import { getAllMedalCurriculum } from "@/lib/medals/curriculum";
import { medalChipClass } from "@/lib/medals/medal-chip-colors";
import { cn } from "@/lib/utils";

const curriculumByLevel = new Map(
  getAllMedalCurriculum().map((c) => [c.medalLevel, c]),
);

export function MedalLadderStrip({
  activeLevel,
  className,
}: {
  activeLevel?: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto pb-2", className)}>
      <div className="flex min-w-max gap-2">
        {MEDAL_LEVELS.map((level) => {
          const curriculum = curriculumByLevel.get(level.value);
          const chip = medalChipClass(level.value);
          const isActive = activeLevel === level.value;
          return (
            <Link
              key={level.value}
              href={`/coach/medals/${level.value}`}
              className={cn(
                "flex w-[7.5rem] shrink-0 flex-col rounded-xl border p-3 transition-all hover:shadow-md",
                isActive
                  ? "border-[var(--triaz-ink)] ring-2 ring-[var(--triaz-ink)]/20"
                  : "border-[var(--border)] hover:border-[var(--triaz-ink)]/40",
              )}
            >
              <span
                className={cn(
                  "inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-bold",
                  chip,
                )}
              >
                {level.shortCode}
              </span>
              <span className="mt-2 text-sm font-medium leading-tight">
                {level.label}
              </span>
              {curriculum && (
                <span className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  {curriculum.typicalAge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
