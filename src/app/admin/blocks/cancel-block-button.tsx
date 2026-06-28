"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { cancelBlock } from "./actions";

export function CancelBlockButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const { run, pending: isPending } = useActionFeedback({
    success: "Block cancelled",
    onSuccess: () => setConfirming(false),
    onError: () => setConfirming(false),
  });

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(true)}
        disabled={isPending}
      >
        Cancel
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        Keep
      </Button>
      <Button
        size="sm"
        variant="destructive"
        loading={isPending}
        onClick={() => run(() => cancelBlock({ id }))}
      >
        {isPending ? "..." : "Confirm"}
      </Button>
    </div>
  );
}
