"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionFeedback } from "@/lib/feedback";
import { requestMembershipCancellation } from "@/lib/memberships/actions";

export function CancelMembershipButton({
  membershipId,
  expiresOnLabel,
}: {
  membershipId: string;
  expiresOnLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run, pending, error: actionError } = useActionFeedback({
    success: () => "Cancellation request sent",
    successDescription: () => "We'll get back to you within a few business days.",
  });

  const error = localError ?? actionError;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full px-4 py-1.5 text-xs font-medium text-[var(--muted-foreground)] underline-offset-4 hover:underline"
        >
          Cancel membership
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel your membership?</DialogTitle>
          <DialogDescription>
            Your coverage stays active through {expiresOnLabel} while the office
            reviews. We'll only stop renewing — nothing changes today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="cancel-reason">What's prompting this?</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Moving away, switching clubs, taking a season off"
          />
          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep membership
          </Button>
          <Button
            tone="danger"
            disabled={pending}
            onClick={() => {
              setLocalError(null);
              if (reason.trim().length < 5) {
                setLocalError("A short reason helps us a lot (5+ chars).");
                return;
              }
              run(async () => {
                const res = await requestMembershipCancellation({
                  membershipId,
                  reason: reason.trim(),
                });
                if (res.ok) setOpen(false);
                return res;
              });
            }}
          >
            {pending ? "Sending..." : "Send cancellation request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
