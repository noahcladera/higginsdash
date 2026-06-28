"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { COACH_COURT_RATE_PER_HOUR } from "@/lib/invoicing/money";
import {
  setCoachCourtRentalRate,
  setZzpCoachCourtRentalRate,
} from "../../actions";

export function CourtRateCard({
  coachPersonId,
  storedOverrideEurPerHour,
  /** Whether this card edits the staff (HTN) or ZZP override row. */
  kind = "staff",
}: {
  coachPersonId: string;
  /** Null = use global default. */
  storedOverrideEurPerHour: number | null;
  kind?: "staff" | "zzp";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState(
    storedOverrideEurPerHour != null
      ? String(storedOverrideEurPerHour)
      : "",
  );

  const effectiveRate =
    storedOverrideEurPerHour != null
      ? storedOverrideEurPerHour
      : COACH_COURT_RATE_PER_HOUR;
  const isCustom = storedOverrideEurPerHour != null;

  const save = (ratePerHour: number | null) => {
    setError(null);
    startTransition(async () => {
      const res =
        kind === "zzp"
          ? await setZzpCoachCourtRentalRate({
              zzpPersonId: coachPersonId,
              ratePerHour,
            })
          : await setCoachCourtRentalRate({
              coachPersonId,
              ratePerHour,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (ratePerHour == null) {
        setInput("");
      } else {
        setInput(String(ratePerHour));
      }
      router.refresh();
    });
  };

  const handleSave = () => {
    const trimmed = input.trim();
    if (trimmed === "") {
      save(null);
      return;
    }
    const n = Number(trimmed.replace(",", "."));
    if (Number.isNaN(n) || n < 0 || n > 999) {
      setError("Enter a number between 0 and 999 €/h, or leave blank for default.");
      return;
    }
    const rounded = Math.round(n * 100) / 100;
    save(rounded);
  };

  return (
    <div className="elev-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium tracking-tight">
            Court rental rate{kind === "zzp" ? " (ZZP)" : ""}
          </h3>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted-foreground)]">
            Hourly rate used for this coach&apos;s private-lesson invoices and
            their &quot;My hours&quot; estimate. Leave blank to use the club
            default (€{COACH_COURT_RATE_PER_HOUR}/h).
          </p>
        </div>
        <Badge variant={isCustom ? "default" : "outline"}>
          {isCustom ? "Custom" : "Default"}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[var(--muted-foreground)]">
            € / hour
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${COACH_COURT_RATE_PER_HOUR} (default)`}
            className="h-9 w-32 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm tabular-nums"
            disabled={isPending}
          />
        </label>
        <Button type="button" size="sm" onClick={handleSave} loading={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <button
          type="button"
          className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline disabled:opacity-50"
          disabled={isPending || !isCustom}
          onClick={() => save(null)}
        >
          Reset to default
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-[var(--danger-ink)]">{error}</p>}

      <p className="mt-4 text-xs text-[var(--muted-foreground)]">
        Currently billed at{" "}
        <span className="font-medium text-[var(--foreground)]">
          €{effectiveRate.toFixed(2)}/h
        </span>
        {isCustom ? " (stored override)." : " (global default)."}
      </p>
    </div>
  );
}
