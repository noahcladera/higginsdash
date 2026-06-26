"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  coverageDescription,
  formatMembershipPrice,
  type UpgradeOffer,
} from "@/lib/pricing";
import { themeForClubs, clubTheme } from "@/lib/club-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { portalPurchaseSuccessUrl } from "@/lib/portal/purchase-success-url";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { useActionFeedback } from "@/lib/feedback";
import { upgradeMembership } from "./actions";

export interface UpgradeOffersProps {
  offers: UpgradeOffer[];
}

/**
 * Renders the smart upgrade panel. Hidden when {@link offers} is empty.
 *
 * Each offer is a one-click upgrade that cancels the listed `replaces`
 * memberships and creates a new one at `netPrice` (= list - credit).
 */
export function UpgradeOffers({ offers }: UpgradeOffersProps) {
  if (offers.length === 0) return null;

  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
}

function OfferCard({ offer }: { offer: UpgradeOffer }) {
  const router = useRouter();
  const themeKey = themeForClubs(offer.target.clubs);
  const theme = clubTheme(themeKey);
  const [checkoutPending, startCheckout] = useTransition();
  const { run, pending: upgradePending, error } = useActionFeedback({
    success: "Membership upgraded",
    successDescription: "Your old coverage was replaced.",
  });
  const isPending = checkoutPending || upgradePending;

  function onApply() {
    if (offer.netPrice <= 0) {
      // Free upgrades (rare — full credit covers it) skip the fake
      // Mollie page; there's nothing to "pay".
      run(() => upgradeMembership({ offerId: offer.id }));
      return;
    }
    startCheckout(() => {
      void beginCheckout(
        {
          amountEur: offer.netPrice,
          description: `Membership upgrade · ${coverageDescription({
            tier: offer.target.tier,
            clubs: offer.target.clubs,
          })}`,
          returnUrl: portalPurchaseSuccessUrl({
            kind: "membership",
            next: "/portal/membership",
            amountEur: offer.netPrice,
          }),
          action: {
            kind: "membership_upgrade",
            payload: { offerId: offer.id },
          },
        },
        router,
      );
    });
  }

  return (
    <article
      className={cn(
        "fade-in elev-card p-5 sm:p-6",
        theme.bg,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Badge tone={themeKey} variant="solid">
            Upgrade
          </Badge>
          <h3
            className={cn(
              "font-display text-xl font-medium tracking-tight",
              theme.accentText,
            )}
          >
            {offer.label}
          </h3>
          <p className={cn("max-w-prose text-sm", theme.mutedText)}>
            {offer.description}
          </p>
          <p className={cn("text-xs", theme.mutedText)}>
            New membership:{" "}
            <span className={cn("font-medium", theme.accentText)}>
              {coverageDescription({
                tier: offer.target.tier,
                clubs: offer.target.clubs,
              })}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <PriceLine
          label="Catalog price"
          value={formatMembershipPrice(offer.listPrice)}
        />
        <PriceLine
          label={offer.creditEstimated ? "Credit (est.)" : "Credit applied"}
          value={`− ${formatMembershipPrice(offer.credit)}`}
          tone="muted"
        />
        <PriceLine
          label="You pay today"
          value={formatMembershipPrice(offer.netPrice)}
          emphasis
        />
      </div>

      {offer.creditEstimated && (
        <p className={cn("mt-2 text-[11px]", theme.mutedText)}>
          Credit is estimated from the catalog because we don't have the
          original receipt for one of the rows being replaced.
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-[var(--destructive)]">{error}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <p className={cn("text-xs", theme.mutedText)}>
          Replacing {offer.replaces.length} active membership
          {offer.replaces.length === 1 ? "" : "s"}.
        </p>
        <Button
          type="button"
          onClick={onApply}
          disabled={isPending}
          tone={themeKey === "joint" ? "joint" : themeKey}
        >
          {isPending
            ? "Upgrading…"
            : offer.netPrice === 0
              ? "Apply free upgrade"
              : `Upgrade · ${formatMembershipPrice(offer.netPrice)}`}
        </Button>
      </div>
    </article>
  );
}

function PriceLine({
  label,
  value,
  emphasis,
  tone = "default",
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "default" | "muted";
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[var(--card)] px-4 py-3",
        tone === "muted" && "bg-[var(--card)]/70",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={cn(
          "tabular mt-0.5",
          emphasis
            ? "font-display text-2xl font-medium tracking-tight text-[var(--foreground)]"
            : "text-base font-medium text-[var(--foreground)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
