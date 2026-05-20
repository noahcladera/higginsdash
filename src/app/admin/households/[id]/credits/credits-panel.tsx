"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useActionFeedback } from "@/lib/feedback";
import { formatCreditAmount } from "@/lib/credits/format";
import {
  grantHouseholdCreditAction,
  type GrantActionResult,
} from "./actions";

export interface CreditsPanelEntry {
  id: string;
  amountCents: number;
  reason:
    | "transfer_remainder"
    | "withdrawal_refund"
    | "admin_adjustment"
    | "enrollment_payment";
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  relatedEnrollmentId: string | null;
  relatedPaymentId: string | null;
}

/**
 * Inline-editable credit panel for one household. Shows the current
 * balance, a manual-grant form (amount in EUR + reason + optional
 * note), and the latest 25 ledger rows.
 *
 * Admin-only writes go through `grantHouseholdCreditAction` which
 * audits the insert and notifies the household primary contact.
 */
export function CreditsPanel({
  householdId,
  balanceCents,
  entries,
}: {
  householdId: string;
  balanceCents: number;
  entries: CreditsPanelEntry[];
}) {
  const [amountEur, setAmountEur] = useState("");
  const [reason, setReason] = useState<
    "transfer_remainder" | "withdrawal_refund" | "admin_adjustment"
  >("admin_adjustment");
  const [note, setNote] = useState("");

  const { run, pending, error } = useActionFeedback<GrantActionResult>({
    success: () => "Credit granted",
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eur = Number.parseFloat(amountEur);
    if (!Number.isFinite(eur) || eur <= 0) return;
    const amountCents = Math.round(eur * 100);
    run(async () => {
      const res = await grantHouseholdCreditAction({
        householdId,
        amountCents,
        reason,
        note: note.trim() ? note.trim() : null,
      });
      if (res.ok) {
        setAmountEur("");
        setNote("");
      }
      return res;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Available
          </div>
          <div className="font-display text-3xl font-medium tabular tracking-tight">
            {formatCreditAmount(balanceCents)}
          </div>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
      >
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <div>
            <Label htmlFor="credit-amount">Amount (€)</Label>
            <Input
              id="credit-amount"
              inputMode="decimal"
              value={amountEur}
              onChange={(e) => setAmountEur(e.target.value)}
              placeholder="25.00"
              required
            />
          </div>
          <div>
            <Label htmlFor="credit-reason">Reason</Label>
            <select
              id="credit-reason"
              value={reason}
              onChange={(e) =>
                setReason(
                  e.target.value as typeof reason,
                )
              }
              className="block w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              <option value="admin_adjustment">Office adjustment</option>
              <option value="withdrawal_refund">Refund as credit</option>
              <option value="transfer_remainder">Class transfer</option>
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="credit-note">Note (optional)</Label>
          <Input
            id="credit-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why are you crediting this household?"
            maxLength={500}
          />
        </div>
        {error && (
          <p className="text-xs text-[var(--destructive)]">{error}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} variant="solid" tone="triaz">
            {pending ? "Granting…" : "Grant credit"}
          </Button>
        </div>
      </form>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Recent activity
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No movements yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)]">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={e.amountCents > 0 ? "success" : "neutral"}
                      variant="soft"
                    >
                      {labelFor(e.reason)}
                    </Badge>
                    <span className="text-[11px] text-[var(--muted-foreground)] tabular">
                      {e.createdAt}
                    </span>
                  </div>
                  {e.note && (
                    <div className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
                      {e.note}
                    </div>
                  )}
                  {e.createdByName && (
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      by {e.createdByName}
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-display text-base font-medium tabular tracking-tight">
                  {formatCreditAmount(e.amountCents)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function labelFor(reason: CreditsPanelEntry["reason"]): string {
  switch (reason) {
    case "transfer_remainder":
      return "Class transfer";
    case "withdrawal_refund":
      return "Refund as credit";
    case "admin_adjustment":
      return "Office adjustment";
    case "enrollment_payment":
      return "Spent on lesson";
  }
}
