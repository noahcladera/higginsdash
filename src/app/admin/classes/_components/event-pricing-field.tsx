"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/icons";
import type { PricingTier } from "@/lib/classes/pricing-tiers";

type ExtraTierRow = {
  localKey: string;
  label: string;
  amountEur: string;
  note: string;
  forMembers: boolean;
};

function newLocalKey(): string {
  return crypto.randomUUID();
}

/**
 * Event pricing: one required primary price + optional extra tiers
 * (e.g. member price). Emits `pricingTiersJson` for the server.
 */
export function EventPricingField({
  defaultTiers = [],
}: {
  defaultTiers?: PricingTier[];
}) {
  const primaryDefault = defaultTiers.find((t) => !t.forMembers) ?? defaultTiers[0];
  const extrasDefault = defaultTiers.filter(
    (t) => t.id !== primaryDefault?.id,
  );

  const [primaryAmount, setPrimaryAmount] = useState(
    primaryDefault ? String(primaryDefault.amountEur) : "",
  );
  const [primaryNote, setPrimaryNote] = useState(primaryDefault?.note ?? "");
  const [extras, setExtras] = useState<ExtraTierRow[]>(() =>
    extrasDefault.map((t) => ({
      localKey: t.id,
      label: t.label,
      amountEur: String(t.amountEur),
      note: t.note ?? "",
      forMembers: t.forMembers ?? false,
    })),
  );

  const tiersJson = useMemo(() => {
    const tiers: PricingTier[] = [];
    const primaryAmt = Number.parseFloat(primaryAmount);
    if (Number.isFinite(primaryAmt) && primaryAmt >= 0) {
      tiers.push({
        id: primaryDefault?.id ?? crypto.randomUUID(),
        label: "Standard",
        amountEur: primaryAmt,
        note: primaryNote.trim() || undefined,
        forMembers: false,
      });
    }
    for (const row of extras) {
      const amt = Number.parseFloat(row.amountEur);
      if (!row.label.trim() || !Number.isFinite(amt) || amt < 0) continue;
      tiers.push({
        id: row.localKey,
        label: row.label.trim(),
        amountEur: amt,
        note: row.note.trim() || undefined,
        forMembers: row.forMembers,
      });
    }
    return JSON.stringify(tiers);
  }, [primaryAmount, primaryNote, extras, primaryDefault?.id]);

  function addExtra() {
    setExtras((prev) => [
      ...prev,
      {
        localKey: newLocalKey(),
        label: "",
        amountEur: "",
        note: "",
        forMembers: true,
      },
    ]);
  }

  function updateExtra(localKey: string, patch: Partial<ExtraTierRow>) {
    setExtras((prev) =>
      prev.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)),
    );
  }

  function removeExtra(localKey: string) {
    setExtras((prev) => prev.filter((r) => r.localKey !== localKey));
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="pricingTiersJson" value={tiersJson} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Price (EUR)</Label>
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

      {extras.map((row) => (
        <div
          key={row.localKey}
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Additional price</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeExtra(row.localKey)}
            >
              Remove
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={row.label}
                onChange={(e) =>
                  updateExtra(row.localKey, { label: e.target.value })
                }
                placeholder="With membership"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price (EUR)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                max={10000}
                value={row.amountEur}
                onChange={(e) =>
                  updateExtra(row.localKey, { amountEur: e.target.value })
                }
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              value={row.note}
              onChange={(e) =>
                updateExtra(row.localKey, { note: e.target.value })
              }
              maxLength={200}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={row.forMembers}
              onChange={(e) =>
                updateExtra(row.localKey, {
                  forMembers: e.currentTarget.checked,
                })
              }
              className="h-3.5 w-3.5"
            />
            Member price (auto-applied at checkout when they have membership)
          </label>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addExtra}>
        <PlusIcon className="mr-1 h-3.5 w-3.5" />
        Add another price
      </Button>
    </div>
  );
}
