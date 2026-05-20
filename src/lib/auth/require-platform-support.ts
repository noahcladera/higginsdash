import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Platform operators (Higgins staff) who may clear org profile locks.
 * Comma-separated lowercased emails in `PLATFORM_SUPPORT_EMAILS`.
 */
export function parsePlatformSupportEmails(): string[] {
  const raw = process.env.PLATFORM_SUPPORT_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformSupportEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parsePlatformSupportEmails();
  if (allow.length === 0) return false;
  return allow.includes(email.trim().toLowerCase());
}

/**
 * Throws if the signed-in admin is not on the platform support allowlist.
 */
export async function requirePlatformSupport() {
  const { user, person } = await requireAdmin();
  const allow = parsePlatformSupportEmails();
  if (allow.length === 0) {
    throw new Error(
      "Platform support is not configured (set PLATFORM_SUPPORT_EMAILS).",
    );
  }
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !allow.includes(email)) {
    throw new Error("Not authorized for platform support actions.");
  }
  return { user, person };
}
