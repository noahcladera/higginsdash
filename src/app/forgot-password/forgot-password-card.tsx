"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordCard({
  brandName,
  brandLogoUrl,
}: {
  brandName: string;
  brandLogoUrl?: string;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordReset(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Enter your email and we&apos;ll send you a link to choose a new password.
        </p>
      </div>

      {sent ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-4 text-sm space-y-2">
          <p>
            If an account exists for that email, we sent a reset link. Check your
            inbox (and spam). Links expire in 1 hour.
          </p>
          <Link
            href="/login"
            className="inline-block font-medium underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              disabled={isPending}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--destructive)]">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !email}
          >
            {isPending ? "Sending…" : "Send reset link"}
          </Button>

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
