import { headers } from "next/headers";
import type { NextRequest } from "next/server";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname.endsWith(".local")
  );
}

/**
 * Origin for the current HTTP request. Prefer the Host header over
 * `request.url` — Next dev often normalizes `request.url` to localhost
 * even when the client connected via a LAN IP (192.168.x.x).
 */
export function requestOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host");
  if (host) {
    const hostname = host.split(":")[0] ?? host;
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (isLocalDevHost(hostname) ? "http" : "https");
    return stripTrailingSlash(`${proto}://${host}`);
  }
  return stripTrailingSlash(new URL(request.url).origin);
}

export function requestAbsoluteUrl(
  request: NextRequest,
  path: string,
): URL {
  return new URL(path, requestOrigin(request));
}

function isLocalhostHost(host: string): boolean {
  return isLocalDevHost(host.split(":")[0] ?? host);
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

function isLocalhostOrigin(url: string): boolean {
  try {
    return isLocalhostHost(new URL(url).hostname);
  } catch {
    return true;
  }
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
