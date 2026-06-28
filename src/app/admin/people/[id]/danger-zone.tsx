"use client";

import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { archivePerson, restorePerson } from "../actions";

export function PersonDangerZone({
  personId,
  isArchived,
  isSelf,
}: {
  personId: string;
  isArchived: boolean;
  isSelf: boolean;
}) {
  const { run, pending, error } = useActionFeedback({
    success: () => (isArchived ? "Person restored" : "Person archived"),
  });

  function onArchive() {
    if (
      !confirm(
        "Archive this person? They'll be hidden from default lists but can be restored.",
      )
    ) {
      return;
    }
    run(async () => {
      await archivePerson(personId);
      return { ok: true };
    });
  }

  function onRestore() {
    run(async () => {
      await restorePerson(personId);
      return { ok: true };
    });
  }

  return (
    <div className="space-y-2">
      {isArchived ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending}
          onClick={onRestore}
        >
          {pending ? "Restoring…" : "Restore person"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending}
          disabled={pending || isSelf}
          onClick={onArchive}
          title={isSelf ? "You cannot archive yourself." : undefined}
        >
          {pending ? "Archiving…" : "Archive person"}
        </Button>
      )}
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
