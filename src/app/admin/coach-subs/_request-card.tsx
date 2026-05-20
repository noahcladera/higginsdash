"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { useActionFeedback } from "@/lib/feedback";
import { assignCoachSub, denyCoachSub } from "@/lib/coach-subs/actions";

interface RequestSummary {
  id: string;
  reason: string;
  requestedAtIso: string;
  requesterPersonId: string;
  requesterName: string;
  sessionStartIso: string;
  sessionEndIso: string;
  seriesName: string;
  seriesId: string;
  programName: string;
  courtName: string | null;
}

interface CoachOption {
  personId: string;
  label: string;
}

export function CoachSubRequestCard({
  request,
  coachOptions,
}: {
  request: RequestSummary;
  coachOptions: CoachOption[];
}) {
  const [substituteId, setSubstituteId] = useState<string>("");
  const [adminNote, setAdminNote] = useState("");
  const [denyNote, setDenyNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<"assign" | "deny">("assign");

  const { run: runAssign, pending: assigning, error: assignErr } =
    useActionFeedback({
      success: () => "Substitute assigned",
      successDescription: () =>
        "Both coaches have been notified and the schedule is updated.",
    });
  const { run: runDeny, pending: denying, error: denyErr } = useActionFeedback({
    success: () => "Request closed",
    successDescription: () => "We let the coach know we couldn't fill it.",
  });

  const error =
    localError ?? (mode === "assign" ? assignErr : denyErr) ?? null;

  // Don't list the requester themselves as a substitute option.
  const eligible = coachOptions.filter(
    (c) => c.personId !== request.requesterPersonId,
  );

  const handleAssign = () => {
    setLocalError(null);
    setMode("assign");
    if (!substituteId) {
      setLocalError("Pick a substitute coach.");
      return;
    }
    runAssign(() =>
      assignCoachSub({
        requestId: request.id,
        substituteCoachPersonId: substituteId,
        adminNote: adminNote.trim() || undefined,
      }),
    );
  };

  const handleDeny = () => {
    setLocalError(null);
    setMode("deny");
    if (denyNote.trim().length < 5) {
      setLocalError("Please tell the coach what's going on (5+ chars).");
      return;
    }
    runDeny(() =>
      denyCoachSub({
        requestId: request.id,
        adminNote: denyNote.trim(),
      }),
    );
  };

  return (
    <StatusSurface
      tone="warning"
      className="rounded-[var(--radius-lg)] p-5 shadow-[var(--shadow-sm)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{request.requesterName}</span>
            <StatusBadge tone="warning">Pending</StatusBadge>
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              · {request.programName} · {request.seriesName}
              {request.courtName ? ` · ${request.courtName}` : ""}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {formatLocal(request.sessionStartIso)} →{" "}
            {formatTime(request.sessionEndIso)}
          </div>
        </div>
        <div className="text-[11px] text-[var(--muted-foreground)]">
          Requested {formatLocal(request.requestedAtIso)}
        </div>
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-strong)] px-3 py-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
          Coach reason
        </span>
        <p className="mt-1 whitespace-pre-wrap text-sm">{request.reason}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Assign substitute</Label>
          <Select value={substituteId} onValueChange={setSubstituteId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a coach…" />
            </SelectTrigger>
            <SelectContent>
              {eligible.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No eligible coaches
                </SelectItem>
              ) : (
                eligible.map((c) => (
                  <SelectItem key={c.personId} value={c.personId}>
                    {c.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Textarea
            rows={2}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Optional note for both coaches"
          />
          <Button
            tone="triaz"
            disabled={assigning || !substituteId}
            onClick={handleAssign}
            className="w-full"
          >
            {assigning ? "Assigning..." : "Assign substitute"}
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Or close as unfillable</Label>
          <Textarea
            rows={2}
            value={denyNote}
            onChange={(e) => setDenyNote(e.target.value)}
            placeholder="e.g. No coverage available, please teach as scheduled"
          />
          <Button
            variant="outline"
            tone="danger"
            disabled={denying}
            onClick={handleDeny}
            className="w-full"
          >
            {denying ? "Closing..." : "Close (no sub)"}
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

function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
