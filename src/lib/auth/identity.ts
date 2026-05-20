/**
 * Local JWT identity resolution.
 *
 * Replaces the per-request network round-trip to Supabase Auth
 * (`supabase.auth.getUser()`) with a local JWT signature verification
 * via `supabase.auth.getClaims()`. With the new `sb_publishable_*` API
 * key format this project uses, JWTs are signed with an asymmetric ES256
 * key. The SDK fetches the project's JWKS once per Node process from
 * `/auth/v1/.well-known/jwks.json` and verifies signatures locally
 * (~1-3 ms) on every subsequent call instead of hitting the Auth API
 * (~150-300 ms).
 *
 * `getClaims()` also handles near-expiry refresh internally — if the
 * access token is close to expiring it will refresh the session before
 * verifying, which rotates the auth cookies via the cookie callbacks
 * wired up in `createServerClient`. So callers do not need to handle
 * refresh themselves.
 *
 * Important: if `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a legacy `eyJ...`
 * (HS256) key, `getClaims()` silently falls back to a remote
 * `/auth/v1/user` call — which defeats the purpose. We log a one-time
 * warning when that's detected so the misconfiguration is observable.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface JwtIdentity {
  /** Supabase user id (`sub` claim). */
  id: string;
  /** Email if present in claims (it usually is for password / magic-link flows). */
  email: string | null;
  /** Unix-seconds expiry of the access token. */
  expiresAt: number;
}

let warnedAboutLegacyKey = false;

function maybeWarnAboutLegacyKey(): void {
  if (warnedAboutLegacyKey) return;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return;
  // New-format keys start with sb_publishable_ / sb_secret_ and indicate
  // the project is on asymmetric (ES256) JWT signing — what we want.
  // Legacy JWT-formatted keys start with `eyJ` and force HS256, which
  // means getClaims() silently round-trips to the Auth server.
  const isNewFormat =
    anonKey.startsWith("sb_publishable_") ||
    anonKey.startsWith("sb_secret_");
  if (isNewFormat) return;
  warnedAboutLegacyKey = true;
  console.warn(
    "[auth/identity] NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be a legacy " +
      "JWT key (HS256). supabase.auth.getClaims() will fall back to a " +
      "network call per request, defeating local JWT verification. " +
      "Switch to the new sb_publishable_ key format under " +
      "Supabase → Settings → API to enable local verification.",
  );
}

/**
 * Resolves the current request's identity from cookies using local JWT
 * verification. Returns `null` when there is no session, the JWT is
 * missing/invalid, or it has expired.
 *
 * This is the fast-path replacement for `supabase.auth.getUser()` in the
 * authenticated-request hot path. Callers that need server-authoritative
 * state (login, password change, account deletion) should keep using
 * `getUser()` directly.
 */
export async function getJwtIdentity(
  supabase: SupabaseClient,
): Promise<JwtIdentity | null> {
  maybeWarnAboutLegacyKey();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const claims = data.claims;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    return null;
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    expiresAt: typeof claims.exp === "number" ? claims.exp : 0,
  };
}

/**
 * Build a `User`-shaped object from a verified JWT identity. The
 * `PersonAccess.user` field is typed as `User` from
 * `@supabase/supabase-js` and consumers across the app read `user.id`
 * and `user.email`. Synthesising a `User` from claims keeps that
 * contract intact without forcing a refactor of every call site.
 *
 * Fields not present in the JWT (last_sign_in_at, identities, etc.) are
 * left undefined — the codebase doesn't read them on the hot path. If a
 * future caller needs server-authoritative fields, it should call
 * `supabase.auth.getUser()` directly rather than relying on this shape.
 */
export function userFromIdentity(identity: JwtIdentity): User {
  return {
    id: identity.id,
    email: identity.email ?? undefined,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "",
  };
}
