"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useActionFeedback } from "@/lib/feedback";
import { recordRefund } from "@/lib/payments/refund-actions";

export function RefundForm({
  paymentId,
  remaining,
  currency,
}: {
  paymentId: string;
  remaining: number;
  currency: string;
}) {
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error: actionError } = useActionFeedback({
    success: () => "Refund recorded",
    successDescription: () => "Member has been notified.",
  });
  const error = localError ?? actionError;

  return (
    <div className="space-y-4 elev-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="refund-amount">Amount ({currency})</Label>
          <Input
            id="refund-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={remaining.toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="mt-1 text-xs text-[var(--triaz-ink)] underline-offset-4 hover:underline"
            onClick={() => setAmount(remaining.toFixed(2))}
          >
            Refund full remaining (€{remaining.toFixed(2)})
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="refund-reason">Reason</Label>
        <Textarea
          id="refund-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Class withdrawn before start, manual refund per office policy"
        />
      </div>
      <div>
        <Label htmlFor="refund-notes">Internal notes (optional)</Label>
        <Textarea
          id="refund-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bank reference, conversation context, etc."
        />
      </div>

      {error && (
        <p className="rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          tone="triaz"
          loading={pending}
          onClick={() => {
            setLocalError(null);
            const parsed = Number(amount);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              setLocalError("Enter a positive amount.");
              return;
            }
            if (parsed > remaining + 0.001) {
              setLocalError(
                `Can't refund more than €${remaining.toFixed(2)}.`,
              );
              return;
            }
            if (reason.trim().length < 5) {
              setLocalError("Give a short reason (5+ chars).");
              return;
            }
            run(() =>
              recordRefund({
                paymentId,
                amount: parsed,
                reason: reason.trim(),
                notes: notes.trim() || undefined,
              }),
            );
          }}
        >
          {pending ? "Recording..." : "Record refund"}
        </Button>
      </div>
    </div>
  );
}
