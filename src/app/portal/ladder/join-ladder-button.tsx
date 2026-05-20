"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { joinLadder } from "@/lib/ladder/actions";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { useActionFeedback } from "@/lib/feedback";
import { PlusIcon } from "@/components/icons";

export function JoinLadderButton({
  feeCents,
  seasonName,
  small,
}: {
  feeCents: number;
  /** Used as the description on the demo Mollie checkout page. */
  seasonName?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [checkoutPending, startCheckout] = React.useTransition();
  const { run, pending: joinPending, error } = useActionFeedback({
    success: "You're on the ladder",
    successDescription: "We'll surface match invites as challenges come in.",
  });
  const pending = checkoutPending || joinPending;

  const label =
    feeCents > 0
      ? `Join the ladder · €${(feeCents / 100).toFixed(0)}`
      : "Join the ladder";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        tone="triaz"
        size={small ? "sm" : "default"}
        disabled={pending}
        onClick={() => {
          if (feeCents > 0) {
            // Paid season → fake Mollie page first; the underlying
            // joinLadder() runs after "payment" succeeds. Toast for
            // the join itself fires from the post-checkout dispatch.
            startCheckout(() => {
              void beginCheckout(
                {
                  amountEur: feeCents / 100,
                  description: seasonName
                    ? `Adult ladder entry · ${seasonName}`
                    : "Adult ladder entry",
                  returnUrl: "/portal/ladder",
                  action: { kind: "ladder_join", payload: {} },
                },
                router,
              );
            });
            return;
          }

          // Free season — no payment to fake.
          run(() => joinLadder());
        }}
      >
        <PlusIcon /> {pending ? "Joining…" : label}
      </Button>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
