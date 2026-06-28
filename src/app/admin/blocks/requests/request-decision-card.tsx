"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { decideRecurringBlockRequest } from "@/lib/booking/actions";
import type { RecurringConflictDate } from "@/lib/booking/recurring";
import { toast } from "@/lib/feedback";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

interface RequestProps {
  request: {
    id: string;
    coachName: string;
    isZzp: boolean;
    clubName: string;
    courtName: string;
    purposeDescription: string;
    dayOfWeek: DayOfWeek | null;
    startTimeLocal: string;
    endTimeLocal: string;
    startsOn: string;
    endsOn: string;
    excludedDates: string[];
    requestedAt: string;
    priceQuoted: string | null;
    liveClashes: RecurringConflictDate[];
  };
}

export function RecurringRequestCard({ request }: RequestProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adminNote, setAdminNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** When the server's approve re-check finds new clashes, we surface them
   *  here and let the admin click "Approve, skipping these dates". */
  const [pendingApproveClashes, setPendingApproveClashes] = useState<
    RecurringConflictDate[] | null
  >(null);

  const decide = (
    decision: "approve" | "deny",
    extraExcludedDates: string[] = [],
  ) => {
    setError(null);
    if (decision === "deny" && adminNote.trim().length < 5) {
      setError("Please give a denial reason of at least 5 characters.");
      return;
    }
    startTransition(async () => {
      const res = await decideRecurringBlockRequest({
        blockId: request.id,
        decision,
        adminNote: adminNote.trim() || undefined,
        extraExcludedDates,
      });
      if (!res.ok) {
        if (decision === "approve" && res.conflicts && res.conflicts.length > 0) {
          setPendingApproveClashes(res.conflicts);
        }
        setError(res.error);
        toast.error(
          decision === "approve" ? "Couldn't approve" : "Couldn't deny",
          { description: res.error },
        );
        return;
      }
      toast.success(
        decision === "approve"
          ? "Recurring lesson approved"
          : "Recurring lesson denied",
        {
          description:
            decision === "approve"
              ? `${request.coachName} can start using the slot.`
              : `${request.coachName} will see the note.`,
        },
      );
      router.refresh();
    });
  };

  const liveClashes = pendingApproveClashes ?? request.liveClashes;
  const hasLiveClashes = liveClashes.length > 0;

  return (
    <StatusSurface
      tone="warning"
      className="elev-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{request.coachName}</span>
            <StatusBadge tone="warning">Pending</StatusBadge>
            {request.isZzp && (
              <Badge variant="outline" className="ml-2">
                ZZP
              </Badge>
            )}
            <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
              · {request.clubName} · {request.courtName}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {request.purposeDescription}
          </div>
        </div>
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Requested {formatDateTime(request.requestedAt)}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Field label="Day">
          {request.dayOfWeek ? DAY_LABEL[request.dayOfWeek] : "Every day"}
        </Field>
        <Field label="Time">
          <span className="font-mono">
            {request.startTimeLocal}–{request.endTimeLocal}
          </span>
        </Field>
        <Field label="From">
          <span className="font-mono">{request.startsOn}</span>
        </Field>
        <Field label="To">
          <span className="font-mono">{request.endsOn}</span>
        </Field>
      </div>

      {request.excludedDates.length > 0 && (
        <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          Coach already chose to skip{" "}
          <span className="font-medium">
            {request.excludedDates.length} date(s)
          </span>{" "}
          due to known clashes.
        </div>
      )}

      {hasLiveClashes && (
        <div className="mt-3 rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning-ink)]">
          <div className="font-semibold">
            {liveClashes.length} live clash(es) on this series
          </div>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {liveClashes.map((c) => (
              <li key={c.date}>
                <span className="font-mono">{c.date}</span>:{" "}
                {c.conflicts.map((d) => d.label).join(", ")}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px]">
            You can approve and auto-skip these dates, or deny outright.
          </div>
        </div>
      )}

      {request.priceQuoted && (
        <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          Estimated invoice: €{request.priceQuoted} (re-computed at billing
          time from the hourly rate).
        </div>
      )}

      <div className="mt-3 space-y-2">
        <Label htmlFor={`note-${request.id}`}>
          Note to coach (required when denying)
        </Label>
        <Textarea
          id={`note-${request.id}`}
          rows={2}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="e.g. We're planning a U10 class on this slot from June, sorry."
        />
      </div>

      {error && (
        <p className="mt-2 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          tone="danger"
          onClick={() => decide("deny")}
          disabled={isPending}
        >
          {isPending ? "..." : "Deny"}
        </Button>
        {hasLiveClashes ? (
          <Button
            tone="triaz"
            onClick={() => decide("approve", liveClashes.map((c) => c.date))}
            loading={isPending}
          >
            {isPending
              ? "..."
              : `Approve, skip ${liveClashes.length} clash date(s)`}
          </Button>
        ) : (
          <Button
            tone="triaz"
            onClick={() => decide("approve")}
            loading={isPending}
          >
            {isPending ? "..." : "Approve & activate"}
          </Button>
        )}
      </div>
    </StatusSurface>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
