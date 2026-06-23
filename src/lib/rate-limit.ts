import "server-only";

import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Lightweight, fail-open rate limiting backed by Upstash Redis.
 *
 * Configure with env vars (Vercel/Upstash integration sets these):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * When the env vars are absent (local dev / not yet provisioned) the limiter
 * is a no-op that ALLOWS every request — so the app keeps working — but logs a
 * one-time warning. In production you should set the vars (deploy check warns).
 */

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

const redis = url && token ? new Redis({ url, token }) : null;

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED in production.",
    );
  }
}

/** Cache of named limiters so we reuse sliding-window state per bucket. */
const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, limit: number, windowSec: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${limit}:${windowSec}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(key, rl);
  }
  return rl;
}

/** Best-effort client IP from proxy headers. Falls back to a constant. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
}

/**
 * Check a rate-limit bucket. `name` groups the policy (e.g. "login"),
 * `identifier` is the subject (IP, email, user id). Fails OPEN if Upstash
 * isn't configured.
 */
export async function checkRateLimit(
  name: string,
  identifier: string,
  opts: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  const rl = getLimiter(name, opts.limit, opts.windowSec);
  if (!rl) {
    warnOnce();
    return { success: true, remaining: opts.limit };
  }
  try {
    const res = await rl.limit(identifier);
    return { success: res.success, remaining: res.remaining };
  } catch (e) {
    // Never let a limiter outage take down the endpoint.
    console.error("[rate-limit] check failed (failing open)", e);
    return { success: true, remaining: opts.limit };
  }
}

/** Convenience: rate-limit the current request by client IP. */
export async function checkRateLimitByIp(
  name: string,
  opts: { limit: number; windowSec: number },
): Promise<RateLimitResult> {
  const ip = await clientIp();
  return checkRateLimit(name, ip, opts);
}
