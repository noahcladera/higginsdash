import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ProgramRec } from "@/lib/portal/recommend";

/**
 * "What's right for you" strip on the portal home.
 *
 * Renders the top recommendations from the engine as 1–3 hero cards
 * (kids-first when the viewer is a parent) plus a quieter "More to
 * explore" row of up to 3 secondary picks. Renders nothing at all when
 * there are no published programs that match — falling back to the
 * existing "Choose a membership" banner already on the page.
 */
export function RecommendedPrograms({
  hero,
  more,
  isParent,
}: {
  hero: ProgramRec[];
  more: ProgramRec[];
  isParent: boolean;
}) {
  if (hero.length === 0 && more.length === 0) return null;

  const heading = isParent ? "Built for your family" : "Lessons that fit you";
  const subtitle = isParent
    ? "Start here — picked from your kids' ages and schools."
    : "Picked for you. Browse the rest below.";

  return (
    <Section
      title={heading}
      description={subtitle}
      action={
        <Button asChild variant="ghost" tone="neutral" size="sm">
          <Link href="/portal/programs#browse">Browse all classes →</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {hero.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {hero.map((rec) => (
              <ProgramCard key={rec.program.id} rec={rec} variant="hero" />
            ))}
          </div>
        )}
        {more.length > 0 && (
          <div>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              More to explore
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((rec) => (
                <ProgramCard key={rec.program.id} rec={rec} variant="more" />
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function ProgramCard({
  rec,
  variant,
}: {
  rec: ProgramRec;
  variant: "hero" | "more";
}) {
  const href = `/portal/programs/${rec.program.slug}`;
  const isHero = variant === "hero";

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] transition-all",
        "hover:border-[var(--triaz)]/40 hover:shadow-[var(--shadow-md)]",
        isHero ? "p-5 sm:p-6" : "p-4",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
            rec.bucket === "kids" &&
              "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]",
            rec.bucket === "adults" &&
              "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]",
            rec.bucket === "mixed" &&
              "bg-[var(--surface-strong)] text-[var(--foreground)]",
          )}
        >
          {bucketLabel(rec.bucket)}
        </span>
        <ArrowRightIcon className="opacity-50 transition-opacity group-hover:opacity-100" />
      </div>

      <h3
        className={cn(
          "font-display tracking-tight",
          isHero ? "text-xl font-medium sm:text-2xl" : "text-base font-medium",
        )}
      >
        {rec.program.name}
      </h3>
      <p
        className={cn(
          "mt-1 text-sm text-[var(--muted-foreground)]",
          isHero ? "" : "line-clamp-2",
        )}
      >
        {rec.reason}
      </p>

      {isHero && rec.program.descriptionPublic && (
        <p className="mt-3 line-clamp-3 text-sm text-[var(--foreground)]/80">
          {rec.program.descriptionPublic}
        </p>
      )}

      <div className="mt-4 flex items-center text-xs font-semibold text-[var(--triaz-ink)]">
        See classes <span className="ml-1 transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

function bucketLabel(bucket: "kids" | "adults" | "mixed"): string {
  if (bucket === "kids") return "For your kids";
  if (bucket === "adults") return "For you";
  return "For everyone";
}
