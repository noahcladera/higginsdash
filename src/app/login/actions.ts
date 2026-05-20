"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";
import { isSafeInternalPath } from "@/lib/safe-redirect";

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Sign in with an email + password. On success the Supabase session cookie is
 * set on the response, we make sure a `people` row exists for the auth user
 * (so first-time logins are wired into the CRM), and we redirect to the
 * role-appropriate landing page.
 *
 * Returns a `LoginResult` for the client form to display errors. On success
 * this function never returns — `redirect()` throws.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  nextPath?: string | null,
): Promise<LoginResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Could not sign in.",
    };
  }

  await ensurePersonForAuthUser({
    authUserId: data.user.id,
    email: data.user.email ?? null,
  });

  const next =
    isSafeInternalPath(nextPath)
      ? nextPath
      : await defaultRouteForPerson(data.user.id);
  redirect(next);
}
