/**
 * WeeklyCalendar — a Mon-Sun recurring grid that visualises the
 * weekly slot of each currently-matched class series.
 *
 * Every series surfaced by the catalog is weekly-recurring (it has a
 * `dayOfWeek` + `startTime` + `endTime`), so this view answers
 * "what would my week look like if I picked one of these?" — the
 * question the per-series row list can't answer at a glance.
 *
 * Why a recurring grid and not a date calendar:
 *   - All series here repeat weekly, so the dates would mostly be
 *     redundant noise.
 *   - The seasonal window (Apr 6 -> Jun 28) is already shown on each
 *     SeriesRow, so parents don't lose that information.
 *
 * Color-coding:
 *   - Kids audience  -> triaz tone
 *   - Adults audience -> randwijck tone
 *   - Mixed/other    -> joint tone
 * That single visual cue is enough to disambiguate "Adult Beginner"
 * from "Kids Group" sitting on the same Tuesday afternoon.
 */

import Link from "next/link";
import type { DayOfWeek } from "@prisma/client";
import type { CatalogSeriesCard } from "@/lib/portal/catalog-queries";
import { cn } from "@/lib/utils";

interface WeeklyCalendarProps {
  series: CatalogSeriesCard[];
  title?: string;
  hint?: string;
}

const DAYS: { key: DayOfWeek; short: string; long: string }[] = [
  { key: "mon", short: "Mon", long: "Monday" },
  { key: "tue", short: "Tue", long: "Tuesday" },
  { key: "wed", short: "Wed", long: "Wednesday" },
  { key: "thu", short: "Thu", long: "Thursday" },
  { key: "fri", short: "Fri", long: "Friday" },
  { key: "sat", short: "Sat", long: "Saturday" },
  { key: "sun", short: "Sun", long: "Sunday" },
];

type ChipTone = "triaz" | "randwijck" | "joint";

interface BucketedSeries {
  day: DayOfWeek;
  shortLabel: string;
  longLabel: string;
  items: CatalogSeriesCard[];
}

function bucketByDay(series: CatalogSeriesCard[]): BucketedSeries[] {
  return DAYS.map((d) => ({
    day: d.key,
    shortLabel: d.short,
    longLabel: d.long,
    items: series
      .filter((s) => s.dayOfWeek === d.key)
      .sort((a, b) => a.startTimeHHMM.localeCompare(b.startTimeHHMM)),
  }));
}

function chipTone(s: CatalogSeriesCard): ChipTone {
  if (s.programTargetAudience === "kids") return "triaz";
  if (s.programTargetAudience === "adults") return "randwijck";
  return "joint";
}

const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  triaz:
    "bg-[var(--triaz-soft)] text-[var(--triaz-ink)] border border-[var(--triaz)]/20",
  randwijck:
    "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)] border border-[var(--randwijck)]/20",
  joint:
    "bg-[var(--joint-soft)] text-[var(--joint-ink)] border border-[var(--joint)]/20",
};

export function WeeklyCalendar({
  series,
  title = "When these run, week by week",
  hint = "Color shows the audience. Click any chip to open the class.",
}: WeeklyCalendarProps) {
  if (series.length === 0) return null;

  const buckets = bucketByDay(series);

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-xl font-medium tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      </header>

      {/* Desktop / wide tablet: 7 narrow columns */}
      <div className="hidden lg:grid lg:grid-cols-7 lg:gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)]">
        {buckets.map((b) => (
          <DayColumn key={b.day} bucket={b} variant="compact" />
        ))}
      </div>

      {/* Mobile / narrow: stacked-by-day list */}
      <div className="space-y-3 lg:hidden">
        {buckets.map((b) => (
          <DayColumn key={b.day} bucket={b} variant="stacked" />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Internal: one day's column / row
// ---------------------------------------------------------------------------

function DayColumn({
  bucket,
  variant,
}: {
  bucket: BucketedSeries;
  variant: "compact" | "stacked";
}) {
  const isEmpty = bucket.items.length === 0;

  if (variant === "compact") {
    return (
      <div className="flex min-h-[6rem] flex-col gap-1.5">
        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          {bucket.shortLabel}
        </div>
        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--muted-foreground)]/50">
            —
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {bucket.items.map((s) => (
              <CompactChip key={s.id} series={s} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Stacked variant for mobile
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          {bucket.longLabel}
        </span>
        {!isEmpty && (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {bucket.items.length}{" "}
            {bucket.items.length === 1 ? "class" : "classes"}
          </span>
        )}
      </div>
      {isEmpty ? (
        <div className="text-xs text-[var(--muted-foreground)]/60">
          Nothing on {bucket.longLabel.toLowerCase()}.
        </div>
      ) : (
        <ul className="space-y-2">
          {bucket.items.map((s) => (
            <li key={s.id}>
              <StackedChip series={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chip variants
// ---------------------------------------------------------------------------

function CompactChip({ series: s }: { series: CatalogSeriesCard }) {
  const tone = chipTone(s);
  return (
    <Link
      href={`/portal/programs/${s.programSlug}/${s.id}`}
      title={`${s.name} — ${s.venueName}`}
      className={cn(
        "block rounded-md px-2 py-1.5 text-left transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]",
        CHIP_TONE_CLASSES[tone],
      )}
    >
      <div className="tabular text-[11px] font-semibold">
        {s.startTimeHHMM}–{s.endTimeHHMM}
      </div>
      <div className="truncate text-[11px] leading-tight">
        {s.programName}
      </div>
      <div className="truncate text-[10px] opacity-75">{s.venueName}</div>
    </Link>
  );
}

function StackedChip({ series: s }: { series: CatalogSeriesCard }) {
  const tone = chipTone(s);
  return (
    <Link
      href={`/portal/programs/${s.programSlug}/${s.id}`}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]",
        CHIP_TONE_CLASSES[tone],
      )}
    >
      <span className="tabular shrink-0 text-xs font-semibold">
        {s.startTimeHHMM}–{s.endTimeHHMM}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="font-medium">{s.programName}</span>
        <span className="opacity-75"> · {s.venueName}</span>
      </span>
    </Link>
  );
}
