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
} from "@/components/ui/sheet-dialog";
import { RequestStatusBadge } from "@/components/workflow/request-status-badge";
import { useActionFeedback } from "@/lib/feedback";
import { requestCoachSub, cancelCoachSub } from "@/lib/coach-subs/actions";

interface PendingRequest {
  id: string;
  reason: string;
  requestedAtIso: string;
}

interface FilledRequest {
  id: string;
  substituteName: string;
}

interface Props {
  classSessionId: string;
  pending: PendingRequest | null;
  filled: FilledRequest | null;
}

export function RequestSubButton({
  classSessionId,
  pending,
  filled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { run: runRequest, pending: requesting, error: requestErr } =
    useActionFeedback({
      success: () => "Sub request sent",
      successDescription: () => "We've notified the office.",
    });
  const { run: runCancel, pending: cancelling } = useActionFeedback({
    success: () => "Request withdrawn",
  });

  const error = localError ?? requestErr;

  if (filled) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--success-soft)] px-4 py-3 text-sm">
        <div className="font-medium">
          Covered by {filled.substituteName}
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          The substitute is now on this session.
        </div>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Sub request pending</span>
              <RequestStatusBadge status="pending" />
            </div>
            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
              Requested {formatLocal(pending.requestedAtIso)} ·{" "}
              <span className="italic">"{pending.reason}"</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={cancelling}
            onClick={() =>
              runCancel(() => cancelCoachSub({ requestId: pending.id }))
            }
          >
            {cancelling ? "..." : "Withdraw"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Request a sub
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Need a substitute?</DialogTitle>
          <DialogDescription>
            The office gets notified immediately and will assign someone. You'll
            see the substitute's name here once it's filled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="sub-reason">Why can't you make this session?</Label>
          <Textarea
            id="sub-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. doctor's appointment, sick, family event"
          />
          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            tone="triaz"
            loading={requesting}
            onClick={() => {
              setLocalError(null);
              if (reason.trim().length < 5) {
                setLocalError(
                  "Please give the office at least a short reason (5+ chars).",
                );
                return;
              }
              runRequest(async () => {
                const res = await requestCoachSub({
                  classSessionId,
                  reason: reason.trim(),
                });
                if (res.ok) setOpen(false);
                return res;
              });
            }}
          >
            {requesting ? "Sending..." : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
