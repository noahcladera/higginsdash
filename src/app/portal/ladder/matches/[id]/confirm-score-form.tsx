"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { confirmScore } from "@/lib/ladder/actions";
import { useActionFeedback } from "@/lib/feedback";

export function ConfirmScoreForm({ matchId }: { matchId: string }) {
  const [showDispute, setShowDispute] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [lastAction, setLastAction] = React.useState<"confirm" | "dispute">(
    "confirm",
  );
  const { run, pending, error } = useActionFeedback({
    success: () =>
      lastAction === "confirm" ? "Score confirmed" : "Dispute filed",
    successDescription: () =>
      lastAction === "confirm"
        ? "Standings will update shortly."
        : "We'll reach out from the office.",
  });
  const displayError = localError ?? error;

  const submit = (action: "confirm" | "dispute") => {
    setLocalError(null);
    setLastAction(action);
    if (action === "dispute" && !reason.trim()) {
      setLocalError("Add a quick reason so we can sort it out.");
      return;
    }
    run(() =>
      confirmScore({
        matchId,
        action,
        disputeReason: action === "dispute" ? reason.trim() : undefined,
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          tone="triaz"
          size="sm"
          onClick={() => submit("confirm")}
          disabled={pending}
        >
          {pending ? "Confirming…" : "Confirm score"}
        </Button>
        {!showDispute ? (
          <Button
            type="button"
            variant="ghost"
            tone="danger"
            size="sm"
            onClick={() => setShowDispute(true)}
          >
            Dispute
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            tone="neutral"
            size="sm"
            onClick={() => {
              setShowDispute(false);
              setReason("");
              setLocalError(null);
            }}
          >
            Cancel dispute
          </Button>
        )}
      </div>

      {showDispute && (
        <div className="space-y-2">
          <label className="text-xs text-[var(--muted-foreground)]">
            What's wrong with the reported score?
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-sm"
            placeholder="e.g. Set 3 was 7-5, not 6-4."
          />
          <Button
            type="button"
            variant="outline"
            tone="danger"
            size="sm"
            onClick={() => submit("dispute")}
            disabled={pending}
          >
            {pending ? "Sending…" : "Send dispute"}
          </Button>
        </div>
      )}

      {displayError && (
        <span className="text-xs text-[var(--destructive)]">{displayError}</span>
      )}
    </div>
  );
}
