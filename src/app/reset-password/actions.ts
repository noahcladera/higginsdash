"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  NewPasswordSchema,
  RECOVERY_COOKIE,
} from "@/lib/auth/password-reset";

export type CompletePasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set a new password after the user arrived via a recovery email link. Requires
 * the short-lived `password_recovery` cookie set by the auth callback.
 */
export async function completePasswordReset(
  formData: FormData,
): Promise<CompletePasswordResetResult> {
  const cookieStore = await cookies();
  if (cookieStore.get(RECOVERY_COOKIE)?.value !== "1") {
    return {
      ok: false,
      error: "This reset link is invalid or expired.",
    };
  }

  const raw = Object.fromEntries(formData);
  const parsed = NewPasswordSchema.safeParse({
    newPassword: raw.newPassword,
    confirmPassword: raw.confirmPassword,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "This reset link is invalid or expired.",
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    return {
      ok: false,
      error: updateError.message ?? "Could not update password.",
    };
  }

  cookieStore.delete(RECOVERY_COOKIE);
  redirect("/login?notice=password_reset");
}
