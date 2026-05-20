"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export type UpdatePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Re-authenticate with the current password, then set a new password via
 * Supabase so we don't allow password changes on a hijacked session alone.
 */
export async function updateMyPassword(
  formData: FormData,
): Promise<UpdatePasswordResult> {
  const raw = Object.fromEntries(formData);
  const parsed = PasswordSchema.safeParse({
    currentPassword: raw.currentPassword,
    newPassword: raw.newPassword,
    confirmPassword: raw.confirmPassword,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const { currentPassword, newPassword } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "No signed-in user." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return {
      ok: false,
      error: updateError.message ?? "Could not update password.",
    };
  }

  return { ok: true };
}
