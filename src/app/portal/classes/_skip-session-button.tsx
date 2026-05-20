"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useActionFeedback } from "@/lib/feedback";
import {
  markPlannedAbsence,
  unmarkPlannedAbsence,
} from "@/lib/classes/attendance-actions";

/**
 * "I can't make this one" button for an upcoming class session row.
 *
 * If the student is already marked excused for this session, switch to a
 * "Skipping — undo?" pill. Tapping the pill prompts to undo so a parent
 * who clicked by mistake can recover.
 */
export function SkipSessionButton({
  sessionId,
  studentPersonId,
  studentLabel,
  alreadySkipping,
}: {
  sessionId: string;
  studentPersonId: string;
  studentLabel: string;
  alreadySkipping: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mark = useActionFeedback({
    success: "Coach notified",
    successDescription: `We'll let your coach know ${studentLabel} can't make it.`,
    onSuccess: () => {
      setOpen(false);
      setReason("");
    },
  });
  const unmark = useActionFeedback({
    success: "Marked back as attending",
    onSuccess: () => setOpen(false),
  });

  if (alreadySkipping) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1"
            aria-label={`${studentLabel} marked as skipping — tap to undo`}
          >
            <Badge tone="warning">Skipping — tap to undo</Badge>
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo planned absence</DialogTitle>
            <DialogDescription>
              {studentLabel} will be marked as attending again.
            </DialogDescription>
          </DialogHeader>
          {unmark.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {unmark.error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={unmark.pending}
            >
              Keep as skipping
            </Button>
            <Button
              onClick={() =>
                unmark.run(() =>
                  unmarkPlannedAbsence({
                    classSessionId: sessionId,
                    studentPersonId,
                  }),
                )
              }
              disabled={unmark.pending}
            >
              {unmark.pending ? "..." : "Undo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Can&apos;t make it
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip this session</DialogTitle>
          <DialogDescription>
            We&apos;ll notify your coach so they&apos;re not waiting for{" "}
            {studentLabel}. This only affects this one session — your
            enrollment stays the same.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="skip-reason">Quick note for the coach (optional)</Label>
          <Textarea
            id="skip-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. dentist appointment"
          />
        </div>
        {mark.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {mark.error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={mark.pending}
          >
            Never mind
          </Button>
          <Button
            tone="triaz"
            onClick={() =>
              mark.run(() =>
                markPlannedAbsence({
                  classSessionId: sessionId,
                  studentPersonId,
                  reason: reason.trim() || undefined,
                }),
              )
            }
            disabled={mark.pending}
          >
            {mark.pending ? "Sending..." : "Let coach know"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
