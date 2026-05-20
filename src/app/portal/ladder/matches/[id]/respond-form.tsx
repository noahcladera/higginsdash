"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { respondToMatch } from "@/lib/ladder/actions";
import { useActionFeedback } from "@/lib/feedback";

export function RespondForm({
  matchId,
  slots,
  courts,
  opponentName,
}: {
  matchId: string;
  slots: { iso: string; label: string }[];
  courts: { id: string; label: string }[];
  opponentName: string;
}) {
  const [acceptedSlot, setAcceptedSlot] = React.useState<string>(
    slots[0]?.iso ?? "",
  );
  const [courtId, setCourtId] = React.useState<string>(courts[0]?.id ?? "");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [lastAction, setLastAction] = React.useState<"accept" | "decline">("accept");
  const { run, pending, error } = useActionFeedback({
    success: () =>
      lastAction === "accept" ? "Match locked in" : "Match declined",
    successDescription: () =>
      lastAction === "accept"
        ? `Court booked. ${opponentName} will get a heads-up.`
        : undefined,
  });
  const displayError = localError ?? error;

  const submit = (action: "accept" | "decline") => {
    setLocalError(null);
    setLastAction(action);
    if (action === "accept") {
      if (!acceptedSlot) {
        setLocalError("Pick a slot first.");
        return;
      }
      if (!courtId) {
        setLocalError("Pick a court.");
        return;
      }
    }
    run(() =>
      respondToMatch({
        matchId,
        action,
        acceptedSlotUtc: action === "accept" ? acceptedSlot : undefined,
        courtId: action === "accept" ? courtId : undefined,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Slot
        </div>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => {
            const isOn = s.iso === acceptedSlot;
            return (
              <button
                key={s.iso}
                type="button"
                onClick={() => setAcceptedSlot(s.iso)}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  isOn
                    ? "bg-[var(--triaz)] text-white"
                    : "bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--triaz-soft)]"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <span>Court</span>
        <select
          value={courtId}
          onChange={(e) => setCourtId(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
        >
          {courts.length === 0 && <option value="">No courts available</option>}
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {displayError ? (
          <span className="text-xs text-[var(--destructive)]">{displayError}</span>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">
            Accepting auto-books the court for both you and {opponentName}.
          </span>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            tone="danger"
            size="sm"
            disabled={pending}
            onClick={() => submit("decline")}
          >
            Decline
          </Button>
          <Button
            type="button"
            tone="triaz"
            size="sm"
            disabled={pending || !acceptedSlot || !courtId}
            onClick={() => submit("accept")}
          >
            {pending ? "Locking in…" : "Accept & book court"}
          </Button>
        </div>
      </div>
    </div>
  );
}
