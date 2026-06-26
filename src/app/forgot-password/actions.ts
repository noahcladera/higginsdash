"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ForgotPasswordEmailSchema,
  recoveryRedirectUrl,
} from "@/lib/auth/password-reset";
import { resolveAppOrigin } from "@/lib/site-url";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export type RequestPasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

const EmailFormSchema = z.object({
  email: ForgotPasswordEmailSchema,
});

/**
 * Request a password reset email via Supabase Auth. Always returns success to
 * the client when input is valid (anti-enumeration); Supabase errors are logged
 * server-side only.
 */
export async function requestPasswordReset(
  email: string,
): Promise<RequestPasswordResetResult> {
  const parsed = EmailFormSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const ip = await clientIp();
  const rl = await checkRateLimit(
    "password-reset",
    `${ip}:${parsed.data.email}`,
    { limit: 3, windowSec: 3600 },
  );
  if (!rl.success) {
    return {
      ok: false,
      error: "Too many reset requests. Please wait an hour and try again.",
    };
  }

  const origin = await resolveAppOrigin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: recoveryRedirectUrl(origin) },
  );

  if (error) {
    console.error("[password-reset] resetPasswordForEmail failed:", error.message);
  }

  return { ok: true };
}
