import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/icons";
import {
  MaterialTile,
  MaterialTileImageFooter,
} from "@/components/ui/material-tile";
import { cn } from "@/lib/utils";
import type { ProgramRec } from "@/lib/portal/recommend";
import { coverImageObjectPosition } from "@/lib/uploads/cover-image-focus";
import { stripStubPrefix } from "@/lib/classes/clean-text";

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
            <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]/80">
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
  const href =
    rec.program.slug === "events"
      ? "/portal/events"
      : `/portal/programs/${rec.program.slug}`;
  const isHero = variant === "hero";

  const imageNode =
    rec.program.coverImageUrl ? (
      <div
        className={cn(
          "relative w-full overflow-hidden bg-[var(--surface-strong)]",
          isHero ? "aspect-[16/9]" : "aspect-[16/9]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={rec.program.coverImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          style={{
            objectPosition: coverImageObjectPosition(
              rec.program.coverImageFocusY,
            ),
          }}
        />
        {isHero && (
          <MaterialTileImageFooter>
            <span className="rounded-full bg-[var(--card)]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)] backdrop-blur-sm">
              {bucketLabel(rec.bucket)}
            </span>
          </MaterialTileImageFooter>
        )}
      </div>
    ) : undefined;

  return (
    <MaterialTile
      href={href}
      tone={isHero ? "triaz" : "neutral"}
      image={imageNode}
      className={cn(!isHero && "p-0", !rec.program.coverImageUrl && "p-0")}
    >
      <div className={cn(!isHero && "p-4")}>
        {!isHero && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="rounded-full border border-[var(--glass-border-subtle)] bg-[var(--surface-strong)]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
              {bucketLabel(rec.bucket)}
            </span>
            <ArrowRightIcon className="opacity-50 transition-opacity group-hover:opacity-100" />
          </div>
        )}

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
            {stripStubPrefix(rec.program.descriptionPublic)}
          </p>
        )}

        <div className="mt-4 flex items-center text-xs font-semibold text-[var(--triaz-ink)]">
          See classes{" "}
          <span className="ml-1 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>
      </div>
    </MaterialTile>
  );
}

function bucketLabel(bucket: "kids" | "adults" | "mixed"): string {
  if (bucket === "kids") return "For your kids";
  if (bucket === "adults") return "For you";
  return "For everyone";
}
