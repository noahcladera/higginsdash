/**
 * Shared series-card row used by both:
 *   - `/portal/programs/[programSlug]` (one program, day/age/school filters)
 *   - `/portal/programs` Browse All section (every program, full filters)
 *
 * The only thing that varies between the two callers is whether to
 * render the small "Program" tag chip on the left — Browse All always
 * shows it (so users can tell Kids Group from Adult Group at a glance);
 * the per-program list hides it (it's redundant up there).
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogSeriesCard } from "@/lib/portal/catalog-queries";

export function SeriesRow({
  series,
  showProgramTag = false,
}: {
  series: CatalogSeriesCard;
  /** Browse All sets this true; per-program list leaves it false. */
  showProgramTag?: boolean;
}) {
  const href = `/portal/programs/${series.programSlug}/${series.id}`;
  const slotsLeft = Math.max(series.maxStudents - series.enrolledCount, 0);

  return (
    <li>
      <Link
        href={href}
        className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:border-[var(--triaz)]/40 hover:shadow-[var(--shadow-md)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {showProgramTag && (
              <Badge
                variant="soft"
                tone={
                  series.programTargetAudience === "adults"
                    ? "randwijck"
                    : series.programTargetAudience === "kids"
                      ? "triaz"
                      : "neutral"
                }
              >
                {series.programName}
              </Badge>
            )}
            <h3 className="font-display text-lg font-medium tracking-tight">
              {series.name}
            </h3>
            {series.seasonName && (
              <Badge tone="neutral">{series.seasonName}</Badge>
            )}
            {series.schoolName && (
              <Badge tone="joint">{series.schoolName} pickup</Badge>
            )}
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {formatDow(series.dayOfWeek)} · {series.startTimeHHMM}–
            {series.endTimeHHMM} · {series.venueName}
          </p>
          <p className="tabular text-xs text-[var(--muted-foreground)]">
            {formatDateRange(series.startsOn, series.endsOn)}
            {series.minAge != null &&
              series.maxAge != null &&
              ` · Age ${series.minAge}–${series.maxAge}`}
            {series.pricePerSeries != null &&
              ` · €${series.pricePerSeries.toFixed(0)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {series.isFull ? (
            <Badge tone="warning">Waitlist only</Badge>
          ) : (
            <span className="tabular text-sm font-semibold text-[var(--triaz-ink)]">
              {slotsLeft} {slotsLeft === 1 ? "spot" : "spots"} left
            </span>
          )}
          <Button asChild variant="outline" tone="neutral" size="sm">
            <span>
              {series.isFull ? "Join waitlist" : "Enroll"}{" "}
              <span className="ml-1 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </Button>
        </div>
      </Link>
    </li>
  );
}

function formatDow(d: string | null): string {
  switch (d) {
    case "mon":
      return "Monday";
    case "tue":
      return "Tuesday";
    case "wed":
      return "Wednesday";
    case "thu":
      return "Thursday";
    case "fri":
      return "Friday";
    case "sat":
      return "Saturday";
    case "sun":
      return "Sunday";
    default:
      return "—";
  }
}

function formatDateRange(a: Date, b: Date): string {
  const fmt = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(a)} → ${fmt.format(b)}`;
}
