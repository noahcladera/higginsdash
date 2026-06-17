"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  resendCoachInviteForm,
  type CoachInviteActionResult,
} from "./actions";
import { CopyableText } from "./_copyable-text";

export function ResendCoachInviteButton({ inviteId }: { inviteId: string }) {
  const [state, formAction, isPending] = useActionState<
    CoachInviteActionResult | undefined,
    FormData
  >(resendCoachInviteForm, undefined);

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="inviteId" value={inviteId} />
        <input type="hidden" name="loginMethod" value="magiclink" />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isPending ? "Generating…" : "Copy login link"}
        </Button>
      </form>

      {state?.ok === true && state.loginMethod === "magiclink" && (
        <div className="w-full max-w-md space-y-1">
          <p className="text-xs text-[var(--muted-foreground)]">
            {state.emailed
              ? "Link generated and emailed."
              : "Link generated — copy below (email not sent)."}
          </p>
          <CopyableText value={state.actionLink} label="Copy link" />
        </div>
      )}
      {state?.ok === true && state.loginMethod === "password" && (
        <div className="w-full max-w-md space-y-1 text-xs">
          <p className="text-[var(--muted-foreground)]">
            Password reset for {state.email}.
          </p>
          <CopyableText value={state.temporaryPassword} label="Copy password" />
        </div>
      )}
      {state?.ok === false && (
        <p className="max-w-xs text-xs text-[var(--destructive)]">
          {state.error}
        </p>
      )}
    </div>
  );
}
