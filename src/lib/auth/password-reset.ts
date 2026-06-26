import { z } from "zod";

export const RECOVERY_COOKIE = "password_recovery";

export function recoveryRedirectUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=/reset-password`;
}

export const NewPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"],
  });

export const ForgotPasswordEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(200);
