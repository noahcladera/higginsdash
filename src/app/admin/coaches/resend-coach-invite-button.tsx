"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  resendCoachInviteForm,
  type CoachInviteActionResult,
} from "./actions";

export function ResendCoachInviteButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, isPending] = useActionState<
    CoachInviteActionResult | undefined,
    FormData
  >(resendCoachInviteForm, undefined);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Resending…" : "Resend email"}
      </Button>
      {state?.ok === true && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Invite email sent again.
        </p>
      )}
      {state?.ok === false && (
        <p className="max-w-xs text-xs text-[var(--destructive)]">
          {state.error}
        </p>
      )}
    </form>
  );
}
