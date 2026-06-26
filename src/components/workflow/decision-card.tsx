"use client";

/**
 * Generic "approve / deny with reason" card used by every admin queue.
 *
 * The two existing implementations
 * ([deletion-request-card.tsx], [request-decision-card.tsx]) had drifted into
 * subtly different copy, button order, and validation rules. This component
 * standardizes the chrome and lets the caller plug in domain-specific bits:
 *
 *   - `header`, `body` — whatever metadata the queue needs to show
 *   - `conflicts` — optional pre-decision warning (e.g. live recurring clashes)
 *   - `approveLabel`, `denyLabel` — overridable button copy
 *   - `notePlaceholder`, `noteLabel` — domain-appropriate textarea copy
 *   - `onDecide` — async callback called with `{ decision, note }`
 *
 * The card owns the textarea state, the min-length validation (5 chars on
 * deny by default), the disabled state during the transition, and inline
 * error rendering. Toasts are emitted by the caller (which usually has more
 * context for the success copy).
 */

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DecisionResult =
  | { ok: true }
  | { ok: false; error: string };

export interface DecisionCardProps {
  /** Stable id used for label/textarea association. */
  id: string;
  /** Top strip — name + meta + requested-at timestamp. */
  header: ReactNode;
  /** Domain detail (timing, court, etc.) */
  body?: ReactNode;
  /** Optional warning panel rendered before the note textarea. */
  conflicts?: ReactNode;
  /** Note label. Defaults to "Note (required when denying)". */
  noteLabel?: string;
  notePlaceholder?: string;
  /** Minimum trimmed length on deny. Defaults to 5. */
  minDenyLength?: number;
  approveLabel?: string;
  denyLabel?: string;
  /**
   * Caller's decision handler. Returns `ok: true` on success or
   * `ok: false, error` to render inline + keep the card open. This shape
   * lets the caller still drive its own toast copy.
   */
  onDecide: (input: {
    decision: "approve" | "deny";
    note: string;
  }) => Promise<DecisionResult>;
}

export function DecisionCard({
  id,
  header,
  body,
  conflicts,
  noteLabel = "Note to requester (required when denying)",
  notePlaceholder,
  minDenyLength = 5,
  approveLabel = "Approve",
  denyLabel = "Deny",
  onDecide,
}: DecisionCardProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(decision: "approve" | "deny") {
    setError(null);
    if (decision === "deny" && note.trim().length < minDenyLength) {
      setError(
        `Please give a denial reason of at least ${minDenyLength} characters.`,
      );
      return;
    }
    startTransition(async () => {
      const res = await onDecide({ decision, note: note.trim() });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="elev-card p-5">
      {header}
      {body && <div className="mt-3">{body}</div>}
      {conflicts && <div className="mt-3">{conflicts}</div>}

      <div className="mt-3 space-y-2">
        <Label htmlFor={`note-${id}`}>{noteLabel}</Label>
        <Textarea
          id={`note-${id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={notePlaceholder}
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
          disabled={pending}
        >
          {pending ? "..." : denyLabel}
        </Button>
        <Button
          tone="triaz"
          onClick={() => decide("approve")}
          disabled={pending}
        >
          {pending ? "..." : approveLabel}
        </Button>
      </div>
    </div>
  );
}
