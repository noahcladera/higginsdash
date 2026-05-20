import type { MollieAccount } from "@/lib/payments/mollie-accounts";

/**
 * Payment mode for the deployment.
 *
 * - `mollie` when at least one Mollie API key is configured.
 * - `demo` otherwise (local / staging without keys).
 *
 * Set `NEXT_PUBLIC_DEMO_MOLLIE=false` in production when Mollie is live
 * so the demo checkout UI cannot be used even if someone bookmarks it.
 */
export function isMollieConfigured(): boolean {
  return Boolean(
    process.env.MOLLIE_API_KEY_TRIAZ?.trim() ||
      process.env.MOLLIE_API_KEY_HIGGINS?.trim(),
  );
}

export function isDemoCheckoutAllowed(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MOLLIE === "false") return false;
  if (process.env.NODE_ENV === "production" && isMollieConfigured()) {
    return false;
  }
  return true;
}

export function paymentsMode(): "mollie" | "demo" {
  return isMollieConfigured() ? "mollie" : "demo";
}

export function getMollieApiKey(account: MollieAccount): string | null {
  const key =
    account === "triaz"
      ? process.env.MOLLIE_API_KEY_TRIAZ
      : process.env.MOLLIE_API_KEY_HIGGINS;
  const trimmed = key?.trim();
  return trimmed || null;
}

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set — required for Mollie redirect and webhook URLs.",
    );
  }
  return url.replace(/\/$/, "");
}
