/**
 * Canonical app origin for redirects (matches Supabase Auth Site URL).
 */
export function getAppOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  if (raw) return raw;
  return "http://localhost:3000";
}
