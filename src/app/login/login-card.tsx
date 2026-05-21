"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInWithPassword } from "./actions";

type Method = "password" | "magic";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * Client-side login card. The parent server component resolves the
 * current tenant's display name and passes it in as `brandName`, so the
 * heading updates per-tenant without baking "Higgins Tennis NL" into
 * the client bundle.
 */
export function LoginCard({
  brandName,
  brandLogoUrl,
}: {
  brandName: string;
  brandLogoUrl?: string;
}) {
  const [method, setMethod] = useState<Method>("password");
  const params = useSearchParams();

  // Recovery: if Supabase dumped us here with a session in the URL hash
  // (e.g. invite email's legacy implicit flow), forward to /auth/callback
  // which will pick up the session and route us to the right place.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      window.location.replace(`/auth/callback${hash}`);
    }
  }, []);

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
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
          {brandName}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Welcome back. Sign in to your account.
        </p>
      </div>

      <AuthErrorBanner />

      {/* Method toggle */}
      <div className="inline-flex w-full overflow-hidden rounded-md border border-[var(--border)] text-sm">
        <button
          type="button"
          onClick={() => setMethod("password")}
          className={
            "flex-1 px-3 py-1.5 transition-colors " +
            (method === "password"
              ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
              : "hover:bg-[var(--muted)]")
          }
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMethod("magic")}
          className={
            "flex-1 border-l border-[var(--border)] px-3 py-1.5 transition-colors " +
            (method === "magic"
              ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
              : "hover:bg-[var(--muted)]")
          }
        >
          Email me a link
        </button>
      </div>

      {method === "password" ? (
        <PasswordForm nextPath={params.get("next")} />
      ) : (
        <MagicLinkForm />
      )}

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

function PasswordForm({ nextPath }: { nextPath: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signInWithPassword(email, password, nextPath);
      if (!res.ok) setError(res.error);
      // Success path: server action redirects, this branch is unreachable.
    });
  }

  return (
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

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !email || !password}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });

    const supabase = createSupabaseBrowserClient();
    // Prefer the live browser origin so production login works even when
    // NEXT_PUBLIC_SITE_URL was baked as localhost at build time.
    const siteUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
          "http://localhost:3000");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    setStatus({ kind: "sent" });
  }

  if (status.kind === "sent") {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-4 text-sm">
        Check your email for a magic link. It expires in 1 hour.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          disabled={status.kind === "sending"}
        />
      </div>

      {status.kind === "error" && (
        <p className="text-sm text-[var(--destructive)]">{status.message}</p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={status.kind === "sending" || !email}
      >
        {status.kind === "sending" ? "Sending…" : "Send magic link"}
      </Button>
    </form>
  );
}
