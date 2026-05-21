import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Supabase PKCE flows must complete at `/auth/callback`. If the project's
 * Redirect URLs omit that path, Supabase falls back to Site URL (`/`) and
 * the app would otherwise send unauthenticated users to `/login`.
 */
export function redirectPkceCodeToAuthCallback(
  request: NextRequest,
): NextResponse | null {
  const url = request.nextUrl;
  if (url.pathname !== "/" && url.pathname !== "/login") {
    return null;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return null;
  }

  const callback = new URL("/auth/callback", url.origin);
  url.searchParams.forEach((value, key) => {
    callback.searchParams.set(key, value);
  });

  return NextResponse.redirect(callback, 303);
}

/** Redirect URLs to allow in Supabase → Authentication → URL configuration. */
export const SUPABASE_AUTH_REDIRECT_URLS = [
  "http://localhost:3000/auth/callback",
  "http://127.0.0.1:3000/auth/callback",
  "https://higginsdash.onrender.com/auth/callback",
] as const;
