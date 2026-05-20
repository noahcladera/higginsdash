/**
 * AudiencePromoStrip — three tinted entry tiles on the enrollment
 * landing page.
 *
 * Each tile pre-applies the wizard's params (audience, delivery) so a
 * parent who taps "Pickup" lands directly on the school step and sees
 * exactly the classes they care about. The "From €X" subhead is
 * sourced from `getCheapestSeriesPriceByBucket` so the price stays
 * honest if the catalog shifts.
 */

import Link from "next/link";
import { FamilyIcon, TrophyIcon, MapPinIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type PromoTone = "triaz" | "randwijck" | "joint";

export interface AudiencePromoPrices {
  youth: number | null;
  adults: number | null;
  pickup: number | null;
}

export function AudiencePromoStrip({ prices }: { prices: AudiencePromoPrices }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PromoTile
        tone="triaz"
        href="/portal/programs?audience=youth#browse"
        icon={<FamilyIcon size={22} />}
        title="Youth"
        description="Group lessons for kids — at our courts or with school pickup."
        priceLabel={priceLabel(prices.youth)}
      />
      <PromoTile
        tone="randwijck"
        href="/portal/programs?audience=adults#browse"
        icon={<TrophyIcon size={22} />}
        title="Adults"
        description="Weekly group lessons at the club for every level."
        priceLabel={priceLabel(prices.adults)}
      />
      <PromoTile
        tone="joint"
        href="/portal/programs?audience=youth&delivery=pickup#browse"
        icon={<MapPinIcon size={22} />}
        title="School pickup"
        description="We collect your kid at school and bring them door to court."
        priceLabel={priceLabel(prices.pickup)}
      />
    </div>
  );
}

function priceLabel(eur: number | null): string | null {
  if (eur == null) return null;
  // Match the catalog convention of whole-euro display for promo tiles.
  return `From €${Math.round(eur)} / season`;
}

const TONE_STYLES: Record<
  PromoTone,
  {
    surface: string;
    icon: string;
    iconText: string;
    cta: string;
    border: string;
  }
> = {
  triaz: {
    surface: "bg-[var(--triaz-soft)]",
    icon: "bg-[var(--triaz)]/15",
    iconText: "text-[var(--triaz-ink)]",
    cta: "text-[var(--triaz-ink)]",
    border: "hover:border-[var(--triaz)]/50",
  },
  randwijck: {
    surface: "bg-[var(--randwijck-soft)]",
    icon: "bg-[var(--randwijck)]/15",
    iconText: "text-[var(--randwijck-ink)]",
    cta: "text-[var(--randwijck-ink)]",
    border: "hover:border-[var(--randwijck)]/50",
  },
  joint: {
    surface: "bg-[var(--joint-soft)]",
    icon: "bg-[var(--surface-strong)]",
    iconText: "text-[var(--foreground)]",
    cta: "text-[var(--foreground)]",
    border: "hover:border-[var(--foreground)]/30",
  },
};

function PromoTile({
  tone,
  href,
  icon,
  title,
  description,
  priceLabel,
}: {
  tone: PromoTone;
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  priceLabel: string | null;
}) {
  const t = TONE_STYLES[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-transparent p-5 shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)]",
        t.surface,
        t.border,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
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
      <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
      <div className="mt-auto flex items-center justify-between text-xs">
        {priceLabel ? (
          <span className="font-display text-base font-medium tabular tracking-tight text-[var(--foreground)]">
            {priceLabel}
          </span>
        ) : (
          <span />
        )}
        <span
          className={cn(
            "font-semibold transition-transform group-hover:translate-x-0.5",
            t.cta,
          )}
        >
          Browse →
        </span>
      </div>
    </Link>
  );
}
