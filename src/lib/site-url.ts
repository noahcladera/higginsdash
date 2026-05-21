import { headers } from "next/headers";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalhostHost(host: string): boolean {
  return host === "localhost" || host.startsWith("127.0.0.1");
}

function isLocalhostOrigin(url: string): boolean {
  try {
    return isLocalhostHost(new URL(url).hostname);
  } catch {
    return true;
  }
}

/**
 * Canonical app origin for redirects (matches Supabase Auth Site URL).
 * Sync — env only. Use {@link resolveAppOrigin} on the server when the
 * request host should win over a stale localhost env.
 */
export function getAppOrigin(): string {
  const raw = stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (raw) return raw;
  return "http://localhost:3000";
}

/**
 * Server-side origin: production env wins; otherwise derive from the
 * incoming request (Render/Vercel forward headers).
 */
export async function resolveAppOrigin(): Promise<string> {
  const fromEnv = stripTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (fromEnv && !isLocalhostOrigin(fromEnv)) return fromEnv;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (isLocalhostHost(host.split(":")[0] ?? host) ? "http" : "https");
    return stripTrailingSlash(`${proto}://${host}`);
  }

  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}
