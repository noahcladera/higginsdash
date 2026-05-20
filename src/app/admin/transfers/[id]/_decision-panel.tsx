"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActionFeedback } from "@/lib/feedback";
import {
  decideClassTransfer,
  rejectClassTransfer,
} from "@/lib/admin/transfer-actions";

interface CandidatePrice {
  id: string;
  label: string;
  newLessonEur: number;
  isFull: boolean;
  groups: Array<{ id: string; name: string }>;
}

/**
 * Two-mode panel: approve (with target + resolution) or reject (with
 * a required note). The approve flow shows the prorated price for
 * each candidate so the office instantly sees what the household will
 * owe / be due.
 */
export function DecisionPanel({
  transferRequestId,
  originalPaidEur,
  requestedTargetId,
  candidates,
}: {
  transferRequestId: string;
  originalPaidEur: number;
  requestedTargetId: string | null;
  candidates: CandidatePrice[];
}) {
  const [tab, setTab] = useState<"approve" | "reject">("approve");
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string>(requestedTargetId ?? "");
  const [groupId, setGroupId] = useState<string>("");
  const [resolution, setResolution] = useState<
    "exact" | "credit" | "refund" | "extra_bill"
  >("exact");
  const [refundEur, setRefundEur] = useState<string>("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [adminNote, setAdminNote] = useState<string>("");
  const [rejectNote, setRejectNote] = useState<string>("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 30);
    return candidates
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 30);
  }, [candidates, search]);

  const selected = candidates.find((c) => c.id === targetId) ?? null;
  const newLessonEur = selected?.newLessonEur ?? 0;
  const deltaEur = newLessonEur - originalPaidEur;
  const deltaCents = Math.round(deltaEur * 100);

  // Auto-default the resolution based on the delta sign — admin can
  // override but this nudges them toward the obvious outcome.
  function pickDefaultResolution(c: CandidatePrice | null) {
    if (!c) {
      setResolution("exact");
      return;
    }
    const d = Math.round((c.newLessonEur - originalPaidEur) * 100);
    if (d === 0) setResolution("exact");
    else if (d > 0) setResolution("extra_bill");
    else setResolution("credit");
  }

  const approve = useActionFeedback({
    success: "Transfer approved",
    successDescription:
      "We've moved the student and notified the household.",
  });
  const reject = useActionFeedback({
    success: "Transfer rejected",
    successDescription: "The household has been notified.",
  });

  function fireApprove() {
    if (!selected) return;
    if (!groupId && selected.groups.length > 1) return;
    const finalGroup =
      groupId || (selected.groups[0]?.id ?? undefined);
    approve.run(() =>
      decideClassTransfer({
        transferRequestId,
        targetClassSeriesId: selected.id,
        targetGroupId: finalGroup,
        resolution,
        refundEur:
          resolution === "refund" && refundEur
            ? Number(refundEur)
            : undefined,
        refundReason:
          resolution === "refund"
            ? refundReason || `Class transfer surplus`
            : undefined,
        extraBillEur:
          resolution === "extra_bill" && deltaEur > 0
            ? Number(deltaEur.toFixed(2))
            : undefined,
        adminNote: adminNote.trim() || undefined,
      }),
    );
  }

  function fireReject() {
    reject.run(() =>
      rejectClassTransfer({
        transferRequestId,
        adminNote: rejectNote,
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          size="sm"
          tone={tab === "approve" ? "triaz" : "neutral"}
          variant={tab === "approve" ? "solid" : "ghost"}
          onClick={() => setTab("approve")}
        >
          Approve transfer
        </Button>
        <Button
          size="sm"
          tone={tab === "reject" ? "neutral" : "neutral"}
          variant={tab === "reject" ? "destructive" : "ghost"}
          onClick={() => setTab("reject")}
        >
          Reject
        </Button>
      </div>

      {tab === "approve" ? (
        <div className="space-y-4 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="space-y-2">
            <Label htmlFor="approve-search" className="text-sm">
              Pick the target class
            </Label>
            <Input
              id="approve-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by program, name, or venue"
            />
            <ul className="max-h-72 divide-y divide-[var(--border)] overflow-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label
                    className={`flex cursor-pointer items-start justify-between gap-3 p-3 ${
                      c.isFull ? "opacity-50" : "hover:bg-[var(--muted)]/30"
                    }`}
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <input
                        type="radio"
                        name="target"
                        value={c.id}
                        checked={targetId === c.id}
                        disabled={c.isFull}
                        onChange={() => {
                          setTargetId(c.id);
                          setGroupId("");
                          pickDefaultResolution(c);
                        }}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {c.label}
                        </span>
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          €{c.newLessonEur.toFixed(2)} prorated
                          {c.isFull ? " · full" : ""}
                        </span>
                      </span>
                    </span>
                    {targetId === c.id && (
                      <Badge
                        tone={
                          c.newLessonEur === originalPaidEur
                            ? "neutral"
                            : c.newLessonEur > originalPaidEur
                              ? "warning"
                              : "success"
                        }
                      >
                        {(c.newLessonEur - originalPaidEur).toFixed(2)}
                      </Badge>
                    )}
                  </label>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="p-4 text-center text-sm text-[var(--muted-foreground)]">
                  No matches.
                </li>
              )}
            </ul>
          </div>

          {selected && selected.groups.length > 1 && (
            <div className="space-y-2">
              <Label className="text-sm">Sub-group</Label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Pick a group…</option>
                {selected.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <div className="space-y-3 rounded-[var(--radius-md)] bg-[var(--muted)]/30 p-3">
              <div className="text-sm">
                Original paid: €{originalPaidEur.toFixed(2)} · New
                prorated: €{newLessonEur.toFixed(2)} · Delta:{" "}
                <strong>€{deltaEur.toFixed(2)}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                <ResolutionPill
                  active={resolution === "exact"}
                  onClick={() => setResolution("exact")}
                  disabled={deltaCents !== 0}
                  label="Exact swap"
                />
                <ResolutionPill
                  active={resolution === "credit"}
                  onClick={() => setResolution("credit")}
                  disabled={deltaCents >= 0}
                  label="Credit surplus"
                />
                <ResolutionPill
                  active={resolution === "refund"}
                  onClick={() => setResolution("refund")}
                  disabled={deltaCents >= 0}
                  label="Refund surplus"
                />
                <ResolutionPill
                  active={resolution === "extra_bill"}
                  onClick={() => setResolution("extra_bill")}
                  disabled={deltaCents <= 0}
                  label="Bill the difference"
                />
              </div>
              {resolution === "refund" && (
                <div className="space-y-2">
                  <Label className="text-xs">Refund (EUR)</Label>
                  <Input
                    inputMode="decimal"
                    value={refundEur}
                    onChange={(e) => setRefundEur(e.target.value)}
                    placeholder={(-deltaEur).toFixed(2)}
                  />
                  <Label className="text-xs">Refund reason</Label>
                  <Input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Class transfer surplus"
                  />
                </div>
              )}
              {resolution === "extra_bill" && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  We'll create a follow-up payment row for €
                  {Math.max(0, deltaEur).toFixed(2)}. Mark it paid once
                  the household settles up.
                </p>
              )}
              {resolution === "credit" && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  €{Math.max(0, -deltaEur).toFixed(2)} will be added to
                  the household's lesson credit ledger.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Note for the household (optional)</Label>
            <Textarea
              rows={2}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="What we want them to know about the change."
            />
          </div>

          {approve.error && (
            <p className="text-sm text-[var(--destructive)]">
              {approve.error}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              tone="triaz"
              disabled={
                approve.pending ||
                !selected ||
                (selected.groups.length > 1 && !groupId)
              }
              onClick={fireApprove}
            >
              {approve.pending ? "Working…" : "Approve and apply"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <Label className="text-sm">Reason for rejection (sent to household)</Label>
          <Textarea
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="e.g. The requested class is full and no other options match."
          />
          {reject.error && (
            <p className="text-sm text-[var(--destructive)]">
              {reject.error}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              variant="destructive"
              disabled={reject.pending || rejectNote.trim().length < 5}
              onClick={fireReject}
            >
              {reject.pending ? "Sending…" : "Reject request"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolutionPill({
  active,
  onClick,
  disabled,
  label,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-[var(--triaz)] bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}
