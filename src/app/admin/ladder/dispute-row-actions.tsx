"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { resolveDispute } from "@/lib/ladder/admin-actions";
import { useActionFeedback } from "@/lib/feedback";

export function DisputeRowActions({
  matchId,
  challengerEntryId,
  challengerName,
  opponentEntryId,
  opponentName,
  hasReportedWinner,
}: {
  matchId: string;
  challengerEntryId: string;
  challengerName: string;
  opponentEntryId: string;
  opponentName: string;
  hasReportedWinner: boolean;
}) {
  const { run: runAction, pending, error } = useActionFeedback({
    success: "Dispute resolved",
  });
  const [note, setNote] = React.useState("");
  const [winnerEntryId, setWinnerEntryId] = React.useState<string>(
    challengerEntryId,
  );

  const run = (action: "uphold_reporter" | "void" | "set_winner") => {
    runAction(() =>
      resolveDispute({
        matchId,
        action,
        winnerEntryId: action === "set_winner" ? winnerEntryId : undefined,
        note: note.trim() || undefined,
      }),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <span>Override winner:</span>
          <select
            value={winnerEntryId}
            onChange={(e) => setWinnerEntryId(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value={challengerEntryId}>{challengerName}</option>
            <option value={opponentEntryId}>{opponentName}</option>
          </select>
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Resolution note (optional)"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasReportedWinner && (
          <Button
            type="button"
            tone="triaz"
            size="sm"
            disabled={pending}
            onClick={() => run("uphold_reporter")}
          >
            Uphold reported score
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          tone="neutral"
          size="sm"
          disabled={pending}
          onClick={() => run("set_winner")}
        >
          Set winner
        </Button>
        <Button
          type="button"
          variant="ghost"
          tone="danger"
          size="sm"
          disabled={pending}
          onClick={() => run("void")}
        >
          Void match
        </Button>
        {error && (
          <span className="text-xs text-[var(--destructive)]">{error}</span>
        )}
      </div>
    </div>
  );
}
