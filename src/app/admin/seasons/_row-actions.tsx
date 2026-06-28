"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { deleteSeason, setSeasonActive } from "./actions";
import {
  EditSeasonDialog,
  type SeasonEditRow,
} from "./_edit-season-dialog";

export function SeasonRowActions({
  season,
  isActive,
  inUseCount,
}: {
  season: SeasonEditRow;
  isActive: boolean;
  inUseCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const archive = useActionFeedback({
    success: isActive
      ? `Archived ${season.name}`
      : `Restored ${season.name}`,
  });
  const remove = useActionFeedback({
    success: `Deleted ${season.name}`,
    onSuccess: () => setConfirming(false),
    onError: () => setConfirming(false),
  });

  function fireArchive() {
    const fd = new FormData();
    fd.set("seasonId", season.id);
    fd.set("isActive", isActive ? "false" : "true");
    archive.run(() => setSeasonActive(fd));
  }

  function fireDelete() {
    const fd = new FormData();
    fd.set("seasonId", season.id);
    remove.run(() => deleteSeason(fd));
  }

  const canDelete = inUseCount === 0;
  const deleteHint = canDelete
    ? undefined
    : `${inUseCount} series use this season — archive it instead.`;

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            tone="neutral"
            disabled={remove.pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            loading={remove.pending}
            onClick={fireDelete}
          >
            {remove.pending ? "Deleting…" : `Delete ${season.name}`}
          </Button>
        </div>
        {remove.error && (
          <p className="max-w-xs text-right text-xs text-[var(--destructive)]">
            {remove.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <EditSeasonDialog
        season={season}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          onClick={() => setEditOpen(true)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          disabled={archive.pending}
          onClick={fireArchive}
        >
          {archive.pending
            ? isActive
              ? "Archiving…"
              : "Restoring…"
            : isActive
              ? "Archive"
              : "Restore"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          disabled={!canDelete}
          title={deleteHint}
          onClick={() => setConfirming(true)}
          className="text-[var(--destructive)] disabled:text-[var(--muted-foreground)]"
        >
          Delete
        </Button>
      </div>
    </>
  );
}
