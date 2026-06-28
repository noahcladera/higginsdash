"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/app/admin/settings/actions";

import { unlockOrgProfileFromSupport } from "@/app/admin/support/actions";

export function UnlockProfileLockForm({
  orgSlug,
  isLocked,
}: {
  orgSlug: string;
  isLocked: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    SaveResult | null,
    FormData
  >(unlockOrgProfileFromSupport, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <Button
        type="submit"
        variant="destructive"
        loading={isPending}
        disabled={!isLocked || isPending}
      >
        {isPending ? "Unlocking…" : "Clear profile lock"}
      </Button>
      {state?.ok === true && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Lock cleared. The tenant can change presets and edit terminology
          again. Reload this page to refresh status.
        </p>
      )}
      {state?.ok === false && (
        <p className="text-sm text-[var(--destructive)]">{state.error}</p>
      )}
    </form>
  );
}
