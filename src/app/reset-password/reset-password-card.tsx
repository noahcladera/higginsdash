"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordReset } from "./actions";

export function ResetPasswordCard({
  brandName,
  brandLogoUrl,
}: {
  brandName: string;
  brandLogoUrl?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await completePasswordReset(formData);
      if (!res.ok) setError(res.error);
      // Success path: server action redirects, this branch is unreachable.
    });
  }

  return (
    <div className="w-full max-w-sm space-y-6 glass-panel-strong rounded-[var(--radius-xl)] p-8">
      <div className="space-y-3 text-center">
        {brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandLogoUrl}
            alt={brandName}
            className="mx-auto h-12 w-auto object-contain"
          />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Enter and confirm your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isPending}
          />
        </div>

        {error && (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Updating…" : "Update password"}
        </Button>

        <p className="text-center text-xs text-[var(--muted-foreground)]">
          Link expired?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
          >
            Request a new one
          </Link>
        </p>
      </form>
    </div>
  );
}
