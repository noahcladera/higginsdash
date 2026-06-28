"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { withdrawEnrollment } from "@/lib/portal/enrollment-actions";

/**
 * Two-step withdraw button: one click to confirm, second click to fire.
 * Keeps the page accessible without a modal — parents are looking at
 * a flat list of cards and need scannable controls.
 */
export function WithdrawButton({
  enrollmentId,
  studentName,
}: {
  enrollmentId: string;
  studentName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { run, pending, error } = useActionFeedback({
    success: `${studentName} withdrawn`,
    successDescription: "If anyone is on the waitlist, they've been promoted.",
    onSuccess: () => setConfirming(false),
    onError: () => setConfirming(false),
  });

  function fire() {
    run(() => withdrawEnrollment({ enrollmentId }));
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        tone="neutral"
        onClick={() => setConfirming(true)}
      >
        Withdraw
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          tone="neutral"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          loading={pending}
          onClick={fire}
        >
          {pending ? "Withdrawing…" : `Withdraw ${studentName}`}
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
