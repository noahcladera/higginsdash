import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { redirectPkceCodeToAuthCallback } from "@/lib/auth/redirect-pkce-code";
import { getJwtIdentity } from "@/lib/auth/identity";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { isDemoCheckoutAllowed } from "@/lib/payments/config";

/**
 * Middleware-time Supabase client. Verifies the auth session locally via
 * the project's JWKS (no network round-trip on the hot path) and gates
 * the protected route groups behind a logged-in user.
 *
 * Refresh policy: `supabase.auth.getClaims()` (used inside
 * `getJwtIdentity`) automatically refreshes the session if the access
 * token is near expiry. When that happens the SDK calls our cookie
 * `setAll` callback below, which writes the rotated cookies onto the
 * outgoing response — same end result as the previous `getUser()` flow,
 * but the network call only happens once per token lifetime instead of
 * once per request.
 *
 * Returns the (possibly mutated) NextResponse the middleware should send back.
 */
export async function updateSession(request: NextRequest) {
  const pkceRedirect = redirectPkceCodeToAuthCallback(request);
  if (pkceRedirect) {
    return pkceRedirect;
  }

  let supabaseResponse = NextResponse.next({ request });

  // Fast path: if the request carries no Supabase auth cookie at all,
  // skip even the local JWT verify. There's no session to inspect and
  // no JWKS-fetch / cookie-rotation work to do. This is mostly hit by
  // anonymous visitors AND every prefetch / asset request that
  // accidentally falls inside the matcher.
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Local JWT verification via the project's cached JWKS. ~1-3 ms warm,
  // vs the 150-300 ms the previous `getUser()` call cost going to
  // eu-central-1 every request. Skip entirely when there's no auth
  // cookie (see fast path above).
  const identity = hasSupabaseCookie
    ? await getJwtIdentity(supabase)
    : null;

  const url = request.nextUrl.clone();

  if (url.pathname.startsWith("/demo/mollie") && !isDemoCheckoutAllowed()) {
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isCoachAcceptInvite =
    url.pathname === "/coach/accept-invite" ||
    url.pathname.startsWith("/coach/accept-invite/");
  const isProtectedRoute =
    url.pathname.startsWith("/admin") ||
    (url.pathname.startsWith("/coach") && !isCoachAcceptInvite) ||
    url.pathname.startsWith("/portal") ||
    url.pathname.startsWith("/levels");
  const isAuthRoute =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/signup") ||
    url.pathname.startsWith("/forgot-password") ||
    url.pathname.startsWith("/auth");

  if (isProtectedRoute && !identity) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already-signed-in visitors on /login or /signup get bounced. We send
  // them to `/` (the root page), which calls `defaultRouteForPerson` and
  // routes them to /admin, /coach, or /portal based on role. That keeps
  // role-aware landing in one place (the root page + auth callback) and
  // avoids hard-coding /portal here, which would briefly land admins in
  // the member portal before they could click "Admin dashboard".
  if (
    isAuthRoute &&
    identity &&
    (url.pathname === "/login" ||
      url.pathname === "/signup" ||
      url.pathname.startsWith("/forgot-password"))
  ) {
    const nextParam = url.searchParams.get("next");
    if (url.pathname === "/login" && isSafeInternalPath(nextParam)) {
      const nextUrl = new URL(nextParam!, url.origin);
      return NextResponse.redirect(nextUrl);
    }
    url.pathname = "/";
    // Drop ?error=… and other query noise so we never bounce between
    // /login?error=not_member and /portal?error=not_member in a redirect loop.
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
