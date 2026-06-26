"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { useActionFeedback } from "@/lib/feedback";
import {
  approveMembershipCancellation,
  denyMembershipCancellation,
} from "@/lib/memberships/actions";

interface MembershipSummary {
  id: string;
  householdName: string;
  householdId: string;
  coverageTier: string;
  expiresOnIso: string;
  pricePaid: number | null;
  requestedAtIso: string | null;
  requesterName: string | null;
  reason: string;
  clubs: string[];
}

export function MembershipCancellationCard({
  membership,
}: {
  membership: MembershipSummary;
}) {
  const [adminNote, setAdminNote] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [flagRefund, setFlagRefund] = useState(
    membership.pricePaid != null && membership.pricePaid > 0,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"approve" | "deny">("approve");

  const { run: runApprove, pending: approving, error: approveErr } =
    useActionFeedback({
      success: () => "Membership cancelled",
      successDescription: () =>
        flagRefund
          ? "Flagged for refund — see Admin · Payments."
          : "Member has been notified.",
    });
  const { run: runDeny, pending: denying, error: denyErr } = useActionFeedback({
    success: () => "Cancellation denied",
    successDescription: () => "Member has been notified, membership stays active.",
  });

  const error =
    localError ?? (mode === "approve" ? approveErr : denyErr) ?? null;

  return (
    <StatusSurface
      tone="warning"
      className="elev-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{membership.householdName}</span>
            <StatusBadge tone="warning">Pending</StatusBadge>
            <span className="text-xs font-normal capitalize text-[var(--muted-foreground)]">
              · {membership.coverageTier} ·{" "}
              {membership.clubs.join(" + ") || "no clubs"}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Expires {formatLocal(membership.expiresOnIso, "date")}
            {membership.pricePaid != null && (
              <span> · paid €{membership.pricePaid.toFixed(2)}</span>
            )}
          </div>
        </div>
        {membership.requestedAtIso && (
          <div className="text-[11px] text-[var(--muted-foreground)]">
            Requested {formatLocal(membership.requestedAtIso, "datetime")}
            {membership.requesterName && (
              <> by {membership.requesterName}</>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Member reason
        </span>
        <p className="mt-1 whitespace-pre-wrap text-sm">
          {membership.reason || "(none)"}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Approve cancellation</Label>
          <Textarea
            rows={2}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Optional note for the member"
          />
          {membership.pricePaid != null && membership.pricePaid > 0 && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={flagRefund}
                onChange={(e) => setFlagRefund(e.target.checked)}
              />
              Flag for refund (€{membership.pricePaid.toFixed(2)} paid)
            </label>
          )}
          <Button
            tone="danger"
            disabled={approving}
            className="w-full"
            onClick={() => {
              setMode("approve");
              setLocalError(null);
              runApprove(() =>
                approveMembershipCancellation({
                  membershipId: membership.id,
                  flagRefund,
                  adminNote: adminNote.trim() || undefined,
                }),
              );
            }}
          >
            {approving ? "Cancelling..." : "Cancel membership"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Deny — keep membership active</Label>
          <Textarea
            rows={2}
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="e.g. Discussed with member by phone, agreed to keep through season"
          />
          <Button
            variant="outline"
            disabled={denying}
            className="w-full"
            onClick={() => {
              setMode("deny");
              setLocalError(null);
              if (denyReason.trim().length < 5) {
                setLocalError(
                  "Tell the member what's going on (5+ chars).",
                );
                return;
              }
              runDeny(() =>
                denyMembershipCancellation({
                  membershipId: membership.id,
                  denialReason: denyReason.trim(),
                }),
              );
            }}
          >
            {denying ? "Saving..." : "Deny request"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      )}
    </StatusSurface>
  );
}

function formatLocal(iso: string, kind: "date" | "datetime"): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(kind === "datetime"
      ? { hour: "2-digit", minute: "2-digit" }
      : {}),
  }).format(new Date(iso));
}
