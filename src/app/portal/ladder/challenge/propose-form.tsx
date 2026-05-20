"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { proposeMatch } from "@/lib/ladder/actions";
import { useActionFeedback } from "@/lib/feedback";

export function ProposeForm({
  opponentEntryId,
  opponentName,
  slots,
  courts,
}: {
  opponentEntryId: string;
  opponentName: string;
  slots: { iso: string; label: string }[];
  courts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(slots.slice(0, Math.min(3, slots.length)).map((s) => s.iso)),
  );
  const [courtId, setCourtId] = React.useState<string>(courts[0]?.id ?? "");
  const [localError, setLocalError] = React.useState<string | null>(null);
  const { run, pending, error } = useActionFeedback<{ id?: string }>({
    success: `Challenge sent to ${opponentName || "opponent"}`,
    successDescription: "We'll let you know when they respond.",
    onSuccess: (r) => {
      if (r.id) router.push(`/portal/ladder/matches/${r.id}`);
    },
    refresh: false,
  });
  const displayError = localError ?? error;

  const toggle = (iso: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else if (next.size < 5) next.add(iso);
      return next;
    });
  };

  const submit = () => {
    setLocalError(null);
    if (selected.size === 0) {
      setLocalError("Pick at least one slot to offer.");
      return;
    }
    run(() =>
      proposeMatch({
        opponentEntryId,
        proposedSlotsUtc: Array.from(selected),
        courtId: courtId || undefined,
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Offer up to 5 slots
      </div>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => {
          const isOn = selected.has(s.iso);
          return (
            <button
              key={s.iso}
              type="button"
              onClick={() => toggle(s.iso)}
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

      {courts.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span>Suggested court</span>
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {displayError ? (
          <span className="text-xs text-[var(--destructive)]">{displayError}</span>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">
            We&apos;ll email {opponentName || "them"} to pick one.
          </span>
        )}
        <Button
          type="button"
          tone="triaz"
          size="sm"
          disabled={pending || selected.size === 0}
          onClick={submit}
        >
          {pending ? "Sending…" : `Challenge ${opponentName || "player"}`}
        </Button>
      </div>
    </div>
  );
}
