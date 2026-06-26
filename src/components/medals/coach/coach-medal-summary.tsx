import Link from "next/link";
import type { MedalLevel } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import type { CoachMedalsReportRow } from "@/lib/medals/coach-medals-report";
import { medalChipClass } from "@/lib/medals/medal-chip-colors";

export function CoachMedalSummary({
  row,
  filterMedal,
}: {
  row: CoachMedalsReportRow | null;
  filterMedal?: MedalLevel;
}) {
  if (!row) {
    return (
      <StatusSurface tone="neutral">
        <p className="text-sm">
          No active class assignments yet. When you are assigned to a series,
          your medal totals will appear here.
        </p>
      </StatusSurface>
    );
  }

  const missing = filterMedal
    ? row.missingMedals.filter(
        (g) =>
          /* gaps don't include medal level — show all missing when filtering */
          true,
      )
    : row.missingMedals;

  const assignedOnFilter = filterMedal ? row.byMedal[filterMedal] : row.assignedCount;
  const enrolled = row.enrolledCount;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-medium">
            {filterMedal ? "Your students on this medal" : "Your medal assignments"}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {filterMedal
              ? `${assignedOnFilter} student${assignedOnFilter === 1 ? "" : "s"} assigned`
              : `${row.assignedCount} of ${enrolled} students have a medal set`}
          </p>
        </div>
        {!filterMedal && (
          <Link
            href="/coach/classes"
            className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
          >
            My classes
          </Link>
        )}
      </div>

      {!filterMedal && (
        <div className="flex flex-wrap gap-2">
          {MEDAL_LEVELS.map((level) => {
            const count = row.byMedal[level.value];
            if (!count) return null;
            return (
              <Link key={level.value} href={`/coach/medals/${level.value}`}>
                <Badge className={medalChipClass(level.value)}>
                  {level.shortCode} {count}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}

      {missing.length > 0 && (
        <StatusSurface tone="warning">
          <p className="text-sm font-medium">
            {missing.length} student{missing.length === 1 ? "" : "s"} still need
            a medal assigned
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {missing.slice(0, 8).map((g) => (
              <li key={`${g.seriesId}-${g.studentPersonId}`}>
                <Link
                  href={`/coach/classes/${g.seriesId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {g.studentName}
                </Link>
                <span className="text-[var(--muted-foreground)]">
                  {" "}
                  · {g.seriesName}
                </span>
              </li>
            ))}
            {missing.length > 8 && (
              <li className="text-[var(--muted-foreground)]">
                +{missing.length - 8} more — open My classes
              </li>
            )}
          </ul>
        </StatusSurface>
      )}
    </div>
  );
}
