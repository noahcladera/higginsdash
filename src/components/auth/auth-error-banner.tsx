"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AUTH_ERROR_MESSAGES,
  isLoginErrorCode,
  type LoginErrorCode,
  type ErrorVariant,
} from "@/lib/auth/error-codes";

const VARIANT_CLASSES: Record<ErrorVariant, string> = {
  destructive:
    "border-[var(--destructive)] bg-[var(--card)] text-[var(--destructive)]",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
};

interface BannerProps {
  /**
   * Optional set of codes this banner is allowed to render. Defaults to all
   * known codes. Useful when a particular surface should ignore some codes
   * (e.g. don't surface `signup_succeeded_signin_failed` outside `/login`).
   */
  only?: ReadonlyArray<LoginErrorCode>;
}

/**
 * Reads `?error=` from the URL and renders the matching banner from
 * {@link AUTH_ERROR_MESSAGES}. Returns `null` if no recognised code is
 * present, so it's safe to drop into any layout/page.
 *
 * Used on `/login` (showing all auth-related codes) and inside `AppShell`
 * (showing the codes that mean "you were redirected here because the
 * route you tried to reach denied you").
 */
export function AuthErrorBanner({ only }: BannerProps = {}) {
  const params = useSearchParams();
  const raw = params.get("error");
  if (!isLoginErrorCode(raw)) return null;
  if (only && !only.includes(raw)) return null;

  const message = AUTH_ERROR_MESSAGES[raw];

  return (
    <div
      role="status"
      className={`rounded-md border p-3 text-sm ${VARIANT_CLASSES[message.variant]}`}
    >
      <span>{message.body}</span>
      {message.cta && (
        <>
          {" "}
          <Link
            href={message.cta.href}
            className="underline underline-offset-2"
          >
            {message.cta.label}
          </Link>
          .
        </>
      )}
    </div>
  );
}
