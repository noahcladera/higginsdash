import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

/**
 * Service-role Supabase client for server-side admin operations that the
 * browser / anon client is not allowed to perform:
 *
 *   - Writing to Storage buckets (uploads).
 *   - Creating auth users (invites / password resets).
 *
 * Never import this into a client component. The `server-only` guard
 * enforces that at build time.
 *
 * Credentials come from `NEXT_PUBLIC_SUPABASE_URL` + the secret
 * `SUPABASE_SERVICE_ROLE_KEY`. If either is missing we return `null` so
 * callers can fall back to a graceful error instead of crashing on
 * import.
 *
 * Wrapped in `React.cache` so every call within the same request hands
 * back the same client instance.
 */
export const getSupabaseAdminClient = cache((): SupabaseClient | null => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

/**
 * Throwing variant — use from server actions that need the client and
 * should surface a clean error when the env isn't configured.
 */
export function requireSupabaseAdminClient(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error(
      "Supabase admin client unavailable: check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return client;
}
