"use client";

import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { archiveHousehold, restoreHousehold } from "../actions";

export function HouseholdDangerZone({
  householdId,
  isArchived,
}: {
  householdId: string;
  isArchived: boolean;
}) {
  const { run, pending, error } = useActionFeedback({
    success: () => (isArchived ? "Household restored" : "Household archived"),
  });

  function onArchive() {
    if (!confirm("Archive this household? Members are preserved.")) return;
    run(async () => {
      await archiveHousehold(householdId);
      return { ok: true };
    });
  }

  function onRestore() {
    run(async () => {
      await restoreHousehold(householdId);
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
          {pending ? "Restoring…" : "Restore household"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending}
          onClick={onArchive}
        >
          {pending ? "Archiving…" : "Archive household"}
        </Button>
      )}
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
