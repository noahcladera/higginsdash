"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { decideBookingCancellation } from "@/lib/booking/actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { useActionFeedback } from "@/lib/feedback";

interface Props {
  booking: {
    id: string;
    startsAt: string;
    endsAt: string;
    courtName: string;
    clubName: string;
    coachName: string;
    cancellationReason: string;
    cancellationRequestedAt: string | null;
  };
}

export function DeletionRequestCard({ booking }: Props) {
  const [denialReason, setDenialReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastDecision, setLastDecision] = useState<"approve" | "deny">("approve");
  const { run, pending: isPending, error: actionError } = useActionFeedback({
    success: () =>
      lastDecision === "approve" ? "Deletion approved" : "Deletion denied",
    successDescription: () =>
      lastDecision === "approve"
        ? "The booking is cancelled."
        : "Coach was notified.",
  });
  const error = localError ?? actionError;

  const decide = (decision: "approve" | "deny") => {
    setLocalError(null);
    setLastDecision(decision);
    if (decision === "deny" && denialReason.trim().length < 5) {
      setLocalError("Please give a denial reason of at least 5 characters.");
      return;
    }
    run(() =>
      decideBookingCancellation({
        bookingId: booking.id,
        decision,
        denialReason: decision === "deny" ? denialReason.trim() : undefined,
      }),
    );
  };

  const startsAtLocal = formatLocal(booking.startsAt);

  return (
    <StatusSurface
      tone="warning"
      className="elev-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{booking.coachName}</span>
            <StatusBadge tone="warning">Pending</StatusBadge>
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              · {booking.clubName} · {booking.courtName}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {startsAtLocal} · 1 hour
          </div>
        </div>
        {booking.cancellationRequestedAt && (
          <div className="text-[11px] text-[var(--muted-foreground)]">
            Requested {formatLocal(booking.cancellationRequestedAt)}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Coach reason
        </span>
        <p className="mt-1 whitespace-pre-wrap text-sm">
          {booking.cancellationReason || "(none)"}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor={`deny-${booking.id}`}>
          Denial reason (only required if denying)
        </Label>
        <Textarea
          id={`deny-${booking.id}`}
          rows={2}
          value={denialReason}
          onChange={(e) => setDenialReason(e.target.value)}
          placeholder="e.g. Booked 3 days ago, can't free up at the last minute"
        />
      </div>

      {error && (
        <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="outline"
          tone="danger"
          onClick={() => decide("deny")}
          disabled={isPending}
        >
          {isPending ? "..." : "Deny"}
        </Button>
        <Button
          tone="triaz"
          onClick={() => decide("approve")}
          disabled={isPending}
        >
          {isPending ? "..." : "Approve & cancel"}
        </Button>
      </div>
    </StatusSurface>
  );
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
