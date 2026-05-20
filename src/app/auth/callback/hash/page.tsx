"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { finishAuthCallback } from "@/app/auth/callback/actions";

/**
 * Hash / implicit invite flow. PKCE `?code=` is handled in
 * {@link ../route.ts} before this page runs.
 */
export default function AuthCallbackHashPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <Suspense fallback={<Pending />}>
        <CallbackHashInner />
      </Suspense>
    </main>
  );
}

function Pending() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
      Finishing sign in…
    </div>
  );
}

function CallbackHashInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const explicitNext = params.get("next");
    const errorDescription =
      params.get("error_description") ?? params.get("error");

    if (errorDescription) {
      setError(errorDescription);
      return;
    }

    async function run() {
      const supabase = createSupabaseBrowserClient();

      // Hash-based flow (Supabase invite default email template).
      const start = Date.now();
      let session = (await supabase.auth.getSession()).data.session;
      while (!session && Date.now() - start < 2_500) {
        await new Promise((r) => setTimeout(r, 100));
        session = (await supabase.auth.getSession()).data.session;
      }

      if (!session) {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (hash.startsWith("#")) {
          const hp = new URLSearchParams(hash.slice(1));
          const access_token = hp.get("access_token");
          const refresh_token = hp.get("refresh_token");
          if (access_token && refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (setErr) {
              setError(setErr.message);
              return;
            }
          }
        }
      }

      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }

      const result = await finishAuthCallback(explicitNext);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(result.next);
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not complete sign in.");
    });
  }, [params, router]);

  if (error) {
    return (
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-8 text-sm">
        <h1 className="text-base font-semibold">Sign-in didn’t complete</h1>
        <p className="text-[var(--muted-foreground)]">{error}</p>
        <Link
          href="/login"
          className="inline-block font-medium underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return <Pending />;
}
