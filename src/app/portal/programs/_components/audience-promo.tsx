/**
 * AudiencePromoStrip — three tinted entry tiles on the enrollment
 * landing page.
 *
 * Each tile pre-applies the wizard's params (audience, delivery) so a
 * parent who taps "Pickup" lands directly on the school step and sees
 * exactly the classes they care about. The "From €X" subhead is
 * sourced from `getCheapestSeriesPriceByBucket` so the price stays
 * honest if the catalog shifts.
 *
 * Youth and School pickup tiles mirror the Browse wizard: locked when
 * the household has no children on the account.
 */

import Link from "next/link";
import { FamilyIcon, TrophyIcon, MapPinIcon } from "@/components/icons";
import {
  MaterialTile,
  type MaterialTileTone,
} from "@/components/ui/material-tile";
import { cn } from "@/lib/utils";

export type PromoTone = "triaz" | "randwijck" | "joint" | "neutral";

export interface AudiencePromoPrices {
  youth: number | null;
  adults: number | null;
  pickup: number | null;
}

const noChildrenNote = (
  <span>
    No children on this account yet.{" "}
    <Link
      href="/portal/family?addChild=1"
      className="font-semibold text-[var(--triaz-ink)] underline-offset-4 hover:underline"
    >
      Add a child
    </Link>{" "}
    to enroll one.
  </span>
);

export function AudiencePromoStrip({
  prices,
  hasChildren,
  marketingImages = {},
}: {
  prices: AudiencePromoPrices;
  hasChildren: boolean;
  marketingImages?: Record<string, string>;
}) {
  const youthLocked = !hasChildren;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PromoTile
        tone="triaz"
        href="/portal/programs?audience=youth#browse"
        icon={<FamilyIcon size={22} />}
        title="Youth"
        description="Group lessons for kids — at our courts or with school pickup."
        priceLabel={priceLabel(prices.youth)}
        imageSrc={marketingImages["audience:youth"]}
        locked={youthLocked}
        lockedNote={noChildrenNote}
      />
      <PromoTile
        tone="neutral"
        href="/portal/programs?audience=adults#browse"
        icon={<TrophyIcon size={22} />}
        title="Adults"
        description="Weekly group lessons at the club for every level."
        priceLabel={priceLabel(prices.adults)}
        imageSrc={marketingImages["audience:adults"]}
      />
      <PromoTile
        tone="joint"
        href="/portal/programs?audience=youth&delivery=pickup#browse"
        icon={<MapPinIcon size={22} />}
        title="School pickup"
        description="We collect your kid at school and bring them door to court."
        priceLabel={priceLabel(prices.pickup)}
        imageSrc={marketingImages["audience:pickup"]}
        locked={youthLocked}
        lockedNote={noChildrenNote}
      />
    </div>
  );
}

function priceLabel(eur: number | null): string | null {
  if (eur == null) return null;
  // Match the catalog convention of whole-euro display for promo tiles.
  return `From €${Math.round(eur)} / season`;
}

const TONE_MAP: Record<PromoTone, MaterialTileTone> = {
  triaz: "triaz",
  randwijck: "randwijck",
  joint: "joint",
  neutral: "neutral",
};

const TONE_STYLES: Record<
  PromoTone,
  {
    icon: string;
    iconText: string;
    cta: string;
  }
> = {
  triaz: {
    icon: "bg-[var(--triaz)]/15",
    iconText: "text-[var(--triaz-ink)]",
    cta: "text-[var(--triaz-ink)]",
  },
  randwijck: {
    icon: "bg-[var(--randwijck)]/15",
    iconText: "text-[var(--randwijck-ink)]",
    cta: "text-[var(--randwijck-ink)]",
  },
  joint: {
    icon: "bg-[var(--joint)]/15",
    iconText: "text-[var(--joint-ink)]",
    cta: "text-[var(--joint-ink)]",
  },
  neutral: {
    icon: "bg-[var(--surface-strong)]/80",
    iconText: "text-[var(--foreground)]",
    cta: "text-[var(--foreground)]",
  },
};

function PromoTile({
  tone,
  href,
  icon,
  title,
  description,
  priceLabel,
  imageSrc,
  locked = false,
  lockedNote,
}: {
  tone: PromoTone;
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  priceLabel: string | null;
  imageSrc?: string;
  locked?: boolean;
  lockedNote?: React.ReactNode;
}) {
  const t = TONE_STYLES[tone];
  const imageNode = imageSrc ? (
    <div className="relative aspect-[16/9] w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  ) : undefined;

  return (
    <MaterialTile
      tone={TONE_MAP[tone]}
      href={href}
      locked={locked}
      image={imageNode}
      className={cn(!imageSrc && "p-0")}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border-subtle)] shadow-[var(--highlight-inset-subtle)]",
                t.icon,
                t.iconText,
              )}
            >
              {icon}
            </div>
            <h3 className="font-display text-xl font-medium tracking-tight">
              {title}
            </h3>
          </div>
          {locked ? (
            <LockGlyph className="shrink-0 text-[var(--muted-foreground)]" />
          ) : (
            <ArrowGlyph className="shrink-0 text-[var(--muted-foreground)] transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 text-xs">
          {locked && lockedNote ? (
            <div className="text-xs leading-relaxed text-[var(--foreground)]">
              {lockedNote}
            </div>
          ) : priceLabel ? (
            <span className="font-display text-base font-medium tabular tracking-tight text-[var(--foreground)]">
              {priceLabel}
            </span>
          ) : (
            <span />
          )}
          {!locked && (
            <span
              className={cn(
                "ml-auto font-semibold transition-transform group-hover:translate-x-0.5",
                t.cta,
              )}
            >
              Browse →
            </span>
          )}
        </div>
      </div>
    </MaterialTile>
  );
}

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function ArrowGlyph({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}
