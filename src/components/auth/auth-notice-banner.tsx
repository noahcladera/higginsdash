"use client";

import { useSearchParams } from "next/navigation";
import {
  AUTH_NOTICE_MESSAGES,
  isAuthNoticeCode,
  type AuthNoticeCode,
  type ErrorVariant,
} from "@/lib/auth/error-codes";

const VARIANT_CLASSES: Record<ErrorVariant, string> = {
  destructive:
    "border-[var(--destructive)] bg-[var(--card)] text-[var(--destructive)]",
  amber: "border-[var(--warning)]/50 bg-[var(--warning-soft)] text-[var(--warning-ink)]",
};

interface BannerProps {
  only?: ReadonlyArray<AuthNoticeCode>;
}

/**
 * Reads `?notice=` from the URL and renders the matching banner from
 * {@link AUTH_NOTICE_MESSAGES}. Returns `null` if no recognised code is present.
 */
export function AuthNoticeBanner({ only }: BannerProps = {}) {
  const params = useSearchParams();
  const raw = params.get("notice");
  if (!isAuthNoticeCode(raw)) return null;
  if (only && !only.includes(raw)) return null;

  const message = AUTH_NOTICE_MESSAGES[raw];

  return (
    <div
      role="status"
      className={`rounded-md border p-3 text-sm ${VARIANT_CLASSES[message.variant]}`}
    >
      {message.body}
    </div>
  );
}
