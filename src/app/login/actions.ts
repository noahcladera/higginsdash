"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export type LoginResult = { ok: true } | { ok: false; error: string };

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

async function loginRateLimit(email: string): Promise<LoginResult | null> {
  const ip = await clientIp();
  const rl = await checkRateLimit("login", `${ip}:${email}`, {
    limit: 10,
    windowSec: 300,
  });
  if (!rl.success) {
    return {
      ok: false,
      error:
        "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }
  return null;
}

/**
 * Throttle sign-in attempts before the client talks to Supabase Auth.
 * Returns `null` when the attempt is allowed.
 */
export async function checkLoginRateLimit(
  email: string,
): Promise<LoginResult | null> {
  const parsed = CredentialsSchema.pick({ email: true }).safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }
  return loginRateLimit(parsed.data.email);
}

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
  const parsed = CredentialsSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  const limited = await loginRateLimit(parsed.data.email);
  if (limited) return limited;

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
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
