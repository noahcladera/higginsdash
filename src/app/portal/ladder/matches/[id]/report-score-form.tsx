"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { reportScore } from "@/lib/ladder/actions";
import { useActionFeedback } from "@/lib/feedback";

interface SetInput {
  a: string;
  b: string;
}

const FRESH: SetInput = { a: "", b: "" };

export function ReportScoreForm({
  matchId,
  side,
}: {
  matchId: string;
  /**
   * Whose entry the "a" column represents to *this user*. The action
   * normalises before storing — entering your-score / their-score is
   * always natural here regardless of role.
   */
  side: "challenger" | "opponent";
}) {
  const [sets, setSets] = React.useState<SetInput[]>([
    { ...FRESH },
    { ...FRESH },
  ]);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const { run, pending, error } = useActionFeedback({
    success: "Score reported",
    successDescription: "Your opponent will be asked to confirm it.",
  });
  const displayError = localError ?? error;

  const update = (idx: number, patch: Partial<SetInput>) => {
    setSets((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const addSet = () => {
    if (sets.length >= 3) return;
    setSets((prev) => [...prev, { ...FRESH }]);
  };
  const removeSet = (idx: number) => {
    setSets((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    setLocalError(null);
    const parsed = sets.map((s) => ({ a: Number(s.a), b: Number(s.b) }));
    for (const p of parsed) {
      if (Number.isNaN(p.a) || Number.isNaN(p.b)) {
        setLocalError("Fill in every set.");
        return;
      }
    }
    run(() => reportScore({ matchId, sets: parsed }));
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Sets · enter your score on the left
      </div>
      <ul className="space-y-2">
        {sets.map((s, idx) => (
          <li key={idx} className="flex items-center gap-2">
            <span className="w-12 text-xs text-[var(--muted-foreground)]">
              Set {idx + 1}
            </span>
            <ScoreInput
              value={s.a}
              onChange={(v) => update(idx, { a: v })}
              label="You"
            />
            <span className="text-[var(--muted-foreground)]">–</span>
            <ScoreInput
              value={s.b}
              onChange={(v) => update(idx, { b: v })}
              label="Them"
            />
            {sets.length > 2 && (
              <button
                type="button"
                onClick={() => removeSet(idx)}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          tone="neutral"
          size="sm"
          onClick={addSet}
          disabled={sets.length >= 3}
        >
          Add 3rd set
        </Button>
        <div className="flex items-center gap-3">
          {displayError && (
            <span className="text-xs text-[var(--destructive)]">{displayError}</span>
          )}
          <Button
            type="button"
            tone="triaz"
            size="sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Reporting…" : "Report score"}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--muted-foreground)]">
        We&apos;ll flip the columns when storing — {side === "challenger" ? "you are the challenger" : "you are the opponent"}.
      </p>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={7}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-center font-display text-base tabular"
      aria-label={label}
    />
  );
}
