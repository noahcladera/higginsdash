import {
  MONTH_LABELS_SHORT,
  calendarBandsForYear,
  currentTriazHalf,
  formatLongDate,
  randwijckStatusOn,
  todayOnCalendar,
} from "@/lib/membership-seasons";
import { cn } from "@/lib/utils";

/**
 * Static season calendar — a 12-month strip showing where each club is
 * in season, with a "today" pin and a quick-glance summary on the side.
 *
 * Designed to live alongside the coverage explainer so customers
 * understand *why* the buy menu disables Randwijck in winter.
 */
export function SeasonCalendar() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const bands = calendarBandsForYear(year);
  const triazHalf = currentTriazHalf(today);
  const randwijck = randwijckStatusOn(today);
  const todayPos = todayOnCalendar(today);

  const triazBands = bands.filter((b) => b.slug === "triaz");
  const randwijckBands = bands.filter((b) => b.slug === "randwijck");

  return (
    <div className="space-y-6">
      <div className="elev-card p-5 sm:p-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {year}
          </div>
          <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <Legend tone="triaz" label="Triaz" />
            <Legend tone="randwijck" label="Randwijck" />
            <Legend tone="today" label="Today" />
          </div>
        </div>

        <div className="relative pt-5">
          <div className="space-y-3">
            <CalendarRow
              label="Triaz"
              tone="triaz"
              bands={triazBands.map((b) => ({
                startMonth: b.startMonth,
                endMonth: b.endMonth,
                tone: b.variant === "triaz-spring" ? "primary" : "secondary",
                label:
                  b.variant === "triaz-spring"
                    ? "Spring/Summer half"
                    : "Autumn/Winter half",
              }))}
            />
            <CalendarRow
              label="Randwijck"
              tone="randwijck"
              bands={randwijckBands.map((b) => ({
                startMonth: b.startMonth,
                endMonth: b.endMonth,
                tone: "primary",
                label: "Open",
              }))}
            />
            <MonthAxis />
          </div>

          {/* Single shared "today" marker that spans both rows. Lives outside
              the rows themselves so the pill isn't clipped by overflow. */}
          <TodayMarker pos={todayPos} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          tone="triaz"
          title={`Triaz · ${triazHalf.label}`}
          line1={`Current half ends ${formatLongDate(addDaysVisual(triazHalf.endsOn, -1))}.`}
          line2="Memberships purchased today end on that date."
        />
        {randwijck.isOpen && randwijck.current ? (
          <SummaryCard
            tone="randwijck"
            title="Randwijck · open now"
            line1={`Season closes ${formatLongDate(addDaysVisual(randwijck.current.endsOn, -1))}.`}
            line2="Memberships ending after closing day are pro-rated to that date."
          />
        ) : (
          <SummaryCard
            tone="warning"
            title="Randwijck · closed for the season"
            line1={`Reopens ${formatLongDate(randwijck.upcoming.startsOn)}.`}
            line2="Joint and Randwijck-only memberships are temporarily unavailable."
          />
        )}
      </div>
    </div>
  );
}

function Legend({
  tone,
  label,
}: {
  tone: "triaz" | "randwijck" | "today";
  label: string;
}) {
  const dotCls =
    tone === "triaz"
      ? "bg-[var(--triaz)]"
      : tone === "randwijck"
        ? "bg-[var(--randwijck)]"
        : "bg-[var(--destructive)]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", dotCls)} aria-hidden />
      {label}
    </span>
  );
}

interface BandSpec {
  startMonth: number;
  endMonth: number;
  tone: "primary" | "secondary";
  label: string;
}

function CalendarRow({
  label,
  tone,
  bands,
}: {
  label: string;
  tone: "triaz" | "randwijck";
  bands: BandSpec[];
}) {
  const palette =
    tone === "triaz"
      ? {
          row: "bg-[var(--triaz-soft)]",
          label: "text-[var(--triaz-ink)]",
          primary: "bg-[var(--triaz)]",
          secondary: "bg-[var(--triaz)]/40",
        }
      : {
          row: "bg-[var(--randwijck-soft)]",
          label: "text-[var(--randwijck-ink)]",
          primary: "bg-[var(--randwijck)]",
          secondary: "bg-[var(--randwijck)]/40",
        };

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-24 shrink-0 text-xs font-semibold uppercase tracking-[0.12em]",
          palette.label,
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "relative h-9 flex-1 overflow-hidden rounded-full",
          palette.row,
        )}
      >
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-px bg-[var(--background)]/60"
            style={{ left: `${((i + 1) / 12) * 100}%` }}
          />
        ))}
        {bands.map((band, idx) => {
          const left = (band.startMonth / 12) * 100;
          const width = ((band.endMonth - band.startMonth) / 12) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={idx}
              className={cn(
                "absolute top-1.5 bottom-1.5 rounded-full",
                band.tone === "primary" ? palette.primary : palette.secondary,
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={band.label}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Vertical "today" line + pill, rendered as an overlay across both rows.
 * Position is given in months (0–12). The marker uses the same column
 * geometry as `CalendarRow` (24-rem label column, then a flex-1 strip).
 */
function TodayMarker({ pos }: { pos: number }) {
  const pct = (pos / 12) * 100;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex items-stretch gap-3"
      aria-hidden
    >
      <div className="w-24 shrink-0" />
      <div className="relative flex-1">
        <div
          className="absolute top-0 bottom-0 w-px bg-[var(--destructive)]/70"
          style={{ left: `${pct}%` }}
        />
        <div
          className="absolute -top-0.5 -translate-x-1/2 rounded-full bg-[var(--destructive)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-[var(--shadow-sm)]"
          style={{ left: `${pct}%` }}
        >
          Today
        </div>
      </div>
    </div>
  );
}

function MonthAxis() {
  return (
    <div className="flex items-center gap-3 pl-[6.75rem]">
      <div className="grid flex-1 grid-cols-12 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {MONTH_LABELS_SHORT.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  tone,
  title,
  line1,
  line2,
}: {
  tone: "triaz" | "randwijck" | "warning";
  title: string;
  line1: string;
  line2: string;
}) {
  const palette =
    tone === "triaz"
      ? "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
      : tone === "randwijck"
        ? "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]"
        : "bg-[var(--warning-soft)] text-[var(--warning-ink)]";
  return (
    <div className={cn("rounded-[var(--radius-md)] px-4 py-3", palette)}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs">{line1}</div>
      <div className="mt-0.5 text-[11px] opacity-80">{line2}</div>
    </div>
  );
}

/**
 * `endsOn` in the season library is exclusive (first day NOT covered),
 * which is convenient for math but confusing for humans. Subtract a day
 * for display so "Sep 1" renders as "31 August" — the actual last day.
 */
function addDaysVisual(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
