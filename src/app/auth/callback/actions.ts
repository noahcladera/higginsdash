"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveAuthCallbackAfterSession,
  type AuthCallbackResult,
} from "@/app/auth/complete-auth-callback";

export type { AuthCallbackResult };

/**
 * Finalize the auth flow once a session exists (client-invoked).
 *
 * Used for the **hash / implicit** invite flow on `/auth/callback/hash`, where
 * the browser client calls `setSession` first. PKCE `?code=` completion runs in
 * the sibling `route.ts` GET handler so the code verifier cookies stay on the
 * same document request as `exchangeCodeForSession`.
 */
export async function finishAuthCallback(
  explicitNext: string | null,
): Promise<AuthCallbackResult> {
  try {
    const supabase = await createSupabaseServerClient();
    return await resolveAuthCallbackAfterSession(supabase, explicitNext);
  } catch (err) {
    console.error("[finishAuthCallback]", err);
    const message =
      err instanceof Error ? err.message : "Could not complete sign in.";
    return { ok: false, error: message };
  }
}
