"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckIcon } from "@/components/icons";
import { useActionFeedback } from "@/lib/feedback";
import type { UpdatePasswordResult } from "@/lib/account/security-actions";

export type SecurityFormTone = "triaz" | "joint";

export function SecurityForm({
  primaryEmail,
  action,
  submitTone = "triaz",
}: {
  primaryEmail: string | null;
  action: (formData: FormData) => Promise<UpdatePasswordResult>;
  submitTone?: SecurityFormTone;
}) {
  const [pwSavedAt, setPwSavedAt] = useState<number | null>(null);
  const {
    run,
    pending: pwPending,
    error: pwError,
  } = useActionFeedback({
    success: "Password updated",
    successDescription: "Use your new password the next time you sign in.",
    errorTitle: "Couldn't update password",
    onSuccess: () => {
      setPwSavedAt(Date.now());
      const form = document.getElementById(
        "account-change-password-form",
      ) as HTMLFormElement | null;
      form?.reset();
    },
  });

  function onPasswordSubmit(formData: FormData) {
    run(() => action(formData));
  }

  return (
    <div className="space-y-10 pb-24">
      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Sign-in email
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your login address is managed via your account provider. Contact
            the office if you need to change it.
          </p>
        </header>
        <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          {primaryEmail ? (
            <p className="font-medium">{primaryEmail}</p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No primary email on file.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <header className="space-y-1.5">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Password
          </h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Enter your current password, then choose a new one.
          </p>
        </header>
        <form
          id="account-change-password-form"
          action={onPasswordSubmit}
          className="grid gap-4 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:grid-cols-2 sm:p-6"
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label
              htmlFor="currentPassword"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              Current password
            </Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="newPassword"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              New password
            </Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="confirmPassword"
              className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)]"
            >
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {pwError ? (
              <span className="text-sm text-[var(--destructive)]">
                {pwError}
              </span>
            ) : pwPending ? (
              <span className="text-sm text-[var(--muted-foreground)]">
                Updating…
              </span>
            ) : pwSavedAt ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--triaz-ink)]">
                <CheckIcon size={16} /> Password updated
              </span>
            ) : null}
            <Button type="submit" tone={submitTone} disabled={pwPending}>
              {pwPending ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
