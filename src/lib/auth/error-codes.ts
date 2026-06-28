import type { AuthErrorCode } from "@/lib/auth/guard";

/**
 * Codes the auth system surfaces via `?error=...` query strings. Includes
 * `AuthErrorCode` (emitted by guards) plus `signup_succeeded_signin_failed`
 * which only the signup flow uses. Keep this union in sync with the
 * banner-message map below — TypeScript will complain if a code is added
 * to the union without copy.
 */
export type LoginErrorCode =
  | AuthErrorCode
  | "signup_succeeded_signin_failed"
  | "auth_callback_failed"
  | "sign_in_failed";

export type AuthNoticeCode = "password_reset";

export type ErrorVariant = "destructive" | "amber";

export interface AuthErrorMessage {
  variant: ErrorVariant;
  body: string;
  /** Optional inline CTA shown to the right of `body`. */
  cta?: { href: string; label: string };
}

/**
 * Banner copy used by both `AuthErrorBanner` (login page) and `AuthDenialBanner`
 * (destination home pages when a guard redirected the user home with an error
 * code). Keeping a single map means we never drift between the two surfaces.
 */
export const AUTH_ERROR_MESSAGES: Record<LoginErrorCode, AuthErrorMessage> = {
  not_signed_in: {
    variant: "destructive",
    body: "Please sign in to continue.",
  },
  not_member: {
    variant: "destructive",
    body:
      "This account isn't linked to a household or participant profile yet. " +
      "If you just joined, finish creating your account at signup. " +
      "Otherwise contact the office so they can connect you in the system.",
    cta: { href: "/signup", label: "Go to signup" },
  },
  not_admin: {
    variant: "destructive",
    body: "That account is not authorized for the admin area.",
  },
  not_coach: {
    variant: "destructive",
    body: "That account is not set up for the staff workspace.",
  },
  account_archived: {
    variant: "destructive",
    body:
      "This account has been archived. Please contact the office if you " +
      "believe this is a mistake.",
  },
  signup_succeeded_signin_failed: {
    variant: "amber",
    body: "Your account was created. Please sign in below to continue.",
  },
  auth_callback_failed: {
    variant: "destructive",
    body:
      "The sign-in link could not be completed. Request a new link from the " +
      "same browser you use for this site (avoid switching between " +
      "localhost and 127.0.0.1), or sign in with password if you have one.",
  },
  sign_in_failed: {
    variant: "destructive",
    body: "That email or password didn't work. Check both and try again.",
  },
};

export const AUTH_NOTICE_MESSAGES: Record<
  AuthNoticeCode,
  AuthErrorMessage
> = {
  password_reset: {
    variant: "amber",
    body: "Your password was reset. Sign in with your new password.",
  },
};

/**
 * Type guard for a raw query-string value. Use before passing strings to
 * the banner components so unknown codes never produce stray UI.
 */
export function isLoginErrorCode(
  value: string | null | undefined,
): value is LoginErrorCode {
  if (!value) return false;
  return value in AUTH_ERROR_MESSAGES;
}

export function isAuthNoticeCode(
  value: string | null | undefined,
): value is AuthNoticeCode {
  if (!value) return false;
  return value in AUTH_NOTICE_MESSAGES;
}
