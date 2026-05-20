"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { activateSeason, closeSeason } from "@/lib/ladder/admin-actions";
import { useActionFeedback } from "@/lib/feedback";

export function SeasonRowActions({
  seasonId,
  isActive,
  anyActive,
}: {
  seasonId: string;
  isActive: boolean;
  anyActive: boolean;
}) {
  const [lastKind, setLastKind] = React.useState<"activate" | "close">(
    "activate",
  );
  const { run: runAction, pending, error } = useActionFeedback({
    success: () => (lastKind === "activate" ? "Season activated" : "Season closed"),
  });

  const run = (kind: "activate" | "close") => {
    if (
      kind === "activate" &&
      anyActive &&
      !confirm("This will close the currently active season. Continue?")
    ) {
      return;
    }
    if (
      kind === "close" &&
      !confirm("Close this season? Players won't be able to challenge.")
    ) {
      return;
    }
    setLastKind(kind);
    runAction(() =>
      kind === "activate"
        ? activateSeason({ seasonId })
        : closeSeason({ seasonId }),
    );
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {!isActive && (
          <Button
            type="button"
            tone="triaz"
            size="sm"
            disabled={pending}
            onClick={() => run("activate")}
          >
            Activate
          </Button>
        )}
        {isActive && (
          <Button
            type="button"
            variant="outline"
            tone="danger"
            size="sm"
            disabled={pending}
            onClick={() => run("close")}
          >
            Close
          </Button>
        )}
      </div>
      {error && (
        <span className="text-[10px] text-[var(--destructive)]">{error}</span>
      )}
    </div>
  );
}
