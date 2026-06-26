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
import { badgeToneForVenueSlug } from "@/lib/club-theme";
import {
  formatPublicAgeLabel,
  programTargetToAudience,
} from "@/lib/classes/age-band";
import type { CatalogSeriesCard } from "@/lib/portal/catalog-queries";
import { coverImageObjectPosition } from "@/lib/uploads/cover-image-focus";

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
  const isEvent = series.classType === "event";
  const isCamp = series.classType === "camp";
  const scheduleLabel = `${formatDow(series.dayOfWeek)} ${series.startTimeHHMM}–${series.endTimeHHMM}`;
  const cardTitle =
    isEvent || isCamp ? series.name : scheduleLabel;
  const hasMemberPricing =
    !isEvent &&
    series.memberPrice != null &&
    series.nonMemberPrice != null;
  const ageLabel = formatPublicAgeLabel({
    minAge: series.minAge,
    maxAge: series.maxAge,
    audience: programTargetToAudience(series.programTargetAudience),
    isEvent: series.classType === "event",
    withAgesPrefix: true,
  });

  return (
    <li>
      <Link
        href={href}
        className="group flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 transition-all hover:border-[var(--triaz)]/40 hover:shadow-[var(--shadow-md)] sm:flex-row sm:items-stretch sm:gap-4"
      >
        <div
          className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-[var(--triaz)]/10 sm:w-28 sm:aspect-[4/3]"
        >
          {series.coverImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={series.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
              style={{
                objectPosition: coverImageObjectPosition(series.coverImageFocusY),
              }}
            />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-br from-[var(--triaz)]/15 to-[var(--randwijck)]/10"
              aria-hidden
            />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-display text-lg font-medium tracking-tight">
            {cardTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {showProgramTag && (
              <Badge variant="soft" tone="neutral">
                {series.programName}
              </Badge>
            )}
            {series.seasonName && (
              <Badge tone="neutral">{series.seasonName}</Badge>
            )}
            <Badge
              tone={badgeToneForVenueSlug(
                series.venueClubSlug ?? series.venueSlug,
              )}
            >
              {series.venueName}
            </Badge>
            {ageLabel ? (
              <Badge tone="neutral">{ageLabel}</Badge>
            ) : null}
            {series.levelLabels.length > 0 &&
              series.levelLabels.map((label) => (
                <Badge key={label} tone="neutral">{label}</Badge>
              ))}
            {series.schoolName && (
              <Badge tone="joint">School pickup</Badge>
            )}
          </div>
          <p className="tabular text-xs text-[var(--muted-foreground)]">
            {isEvent || isCamp ? `${scheduleLabel} · ` : ""}
            {formatDateRange(series.startsOn, series.endsOn)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end justify-between gap-3 sm:min-w-[148px] sm:pl-2">
          <div className="text-right">
            {hasMemberPricing ? (
              <div className="space-y-0.5">
                <p className="tabular text-base font-semibold text-[var(--foreground)]">
                  Member €{series.memberPrice!.toFixed(0)}
                </p>
                <p className="tabular text-xs text-[var(--muted-foreground)]">
                  Non-members €{series.nonMemberPrice!.toFixed(0)}
                </p>
              </div>
            ) : series.pricePerSeries != null ? (
              <p className="tabular text-base font-semibold text-[var(--foreground)]">
                €{series.pricePerSeries.toFixed(0)}
                <span className="text-xs font-normal text-[var(--muted-foreground)]">
                  {" "}
                  / {isEvent ? "event" : isCamp ? "week" : "season"}
                </span>
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
            {series.isFull ? (
              <span className="text-sm font-bold text-[var(--triaz-ink)]">
                Waitlist only
              </span>
            ) : (
              <span className="text-sm font-bold text-[var(--triaz-ink)]">
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
