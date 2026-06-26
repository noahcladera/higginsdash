"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PricingTier } from "@/lib/classes/pricing-tiers";

/**
 * Event pricing: one per-occurrence price. Emits `pricingTiersJson` for
 * the server (single standard tier mirrored on `pricePerSeries`).
 */
export function EventPricingField({
  defaultTiers = [],
}: {
  defaultTiers?: PricingTier[];
}) {
  const primaryDefault =
    defaultTiers.find((t) => !t.forMembers) ?? defaultTiers[0];

  const [primaryAmount, setPrimaryAmount] = useState(
    primaryDefault ? String(primaryDefault.amountEur) : "",
  );
  const [primaryNote, setPrimaryNote] = useState(primaryDefault?.note ?? "");

  const tiersJson = useMemo(() => {
    const primaryAmt = Number.parseFloat(primaryAmount);
    if (!Number.isFinite(primaryAmt) || primaryAmt < 0) return "[]";
    const tiers: PricingTier[] = [
      {
        id: primaryDefault?.id ?? crypto.randomUUID(),
        label: "Standard",
        amountEur: primaryAmt,
        note: primaryNote.trim() || undefined,
        forMembers: false,
      },
    ];
    return JSON.stringify(tiers);
  }, [primaryAmount, primaryNote, primaryDefault?.id]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="pricingTiersJson" value={tiersJson} />

      <p className="text-xs text-[var(--muted-foreground)]">
        Price per occurrence (e.g. one Vrijmibo evening or one tournament
        entry). Parents enroll for the next upcoming date only.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Price per event (EUR)</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            max={10000}
            value={primaryAmount}
            onChange={(e) => setPrimaryAmount(e.target.value)}
            placeholder="25"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Price note (optional)</Label>
          <Input
            value={primaryNote}
            onChange={(e) => setPrimaryNote(e.target.value)}
            placeholder="e.g. Includes drinks"
            maxLength={200}
          />
        </div>
      </div>
    </div>
  );
}
