"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const EXPIRED_LINK_MESSAGE =
  "This sign-in link is invalid or has expired. Ask an admin to resend the invite.";

function readAuthErrorFromLocation(
  searchParams: URLSearchParams,
): string | null {
  const fromQuery =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (fromQuery) return fromQuery;

  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#")) return null;
  const hp = new URLSearchParams(hash.slice(1));
  return hp.get("error_description") ?? hp.get("error");
}

function safeRelativePath(path: string | null): string {
  if (!path) return "/";
  if (!path.startsWith("/")) return "/";
  if (path.startsWith("//")) return "/";
  return path;
}

/**
 * Hash / implicit invite flow. PKCE `?code=` is handled in
 * {@link ../route.ts} before this page runs.
 *
 * After `setSession` succeeds we perform a full document navigation so the
 * destination page picks up auth via cookies + middleware. Server actions
 * mid-flight while client cookies are still propagating cause opaque RSC
 * digest errors in production — full nav avoids that whole class of bugs.
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
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const explicitNext = params.get("next");
    const authError = readAuthErrorFromLocation(params);

    if (authError) {
      setError(authError);
      return;
    }

    async function run() {
      const supabase = createSupabaseBrowserClient();

      let session = (await supabase.auth.getSession()).data.session;

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
            session = (await supabase.auth.getSession()).data.session;
          }
        }
      }

      if (!session) {
        setError(EXPIRED_LINK_MESSAGE);
        return;
      }

      const target = safeRelativePath(explicitNext);
      // Full document navigation so the destination page picks up auth via
      // cookies + middleware. Avoids server-action / cookie-sync timing bugs.
      window.location.assign(target);
    }

    run().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Could not complete sign in.");
    });
  }, [params]);

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
