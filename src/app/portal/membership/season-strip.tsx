import { calendarBandsForYear, MONTH_LABELS_SHORT } from "@/lib/membership-seasons";
import { cn } from "@/lib/utils";
import type { ClubSlug } from "@/lib/pricing";

interface BandSpec {
  startMonth: number;
  endMonth: number;
  tone: "primary" | "secondary";
  label: string;
}

/**
 * Single-club 12-month strip (compact) for embedding in explainer cards.
 * Mirrors the geometry of {@link SeasonCalendar} without the shared
 * "today" overlay.
 */
export function SeasonStrip({ slug }: { slug: ClubSlug }) {
  const year = new Date().getUTCFullYear();
  const bands = calendarBandsForYear(year).filter((b) => b.slug === slug);
  const bandSpecs: BandSpec[] = bands.map((b) => ({
    startMonth: b.startMonth,
    endMonth: b.endMonth,
    tone: slug === "randwijck" ? "primary" : b.variant === "triaz-spring" ? "primary" : "secondary",
    label: b.label,
  }));

  return (
    <div className="space-y-1.5">
      <StripRow slug={slug} bands={bandSpecs} />
      <div className="pl-[5.5rem] sm:pl-[6.75rem]">
        <div className="grid grid-cols-12 text-center text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          {MONTH_LABELS_SHORT.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StripRow({
  slug,
  bands,
}: {
  slug: ClubSlug;
  bands: BandSpec[];
}) {
  const palette =
    slug === "triaz"
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
    <div className="flex items-center gap-2 sm:gap-3">
      <div
        className={cn(
          "w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] sm:w-24 sm:text-xs sm:tracking-[0.12em]",
          palette.label,
        )}
      >
        {slug === "triaz" ? "Triaz" : "Randwijck"}
      </div>
      <div
        className={cn(
          "relative h-7 flex-1 overflow-hidden rounded-full sm:h-9",
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
                "absolute top-1 bottom-1 rounded-full sm:top-1.5 sm:bottom-1.5",
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
