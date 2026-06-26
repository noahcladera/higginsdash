import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthCallbackAfterSession } from "@/app/auth/complete-auth-callback";
import { RECOVERY_COOKIE } from "@/lib/auth/password-reset";
import { resolveAppOrigin } from "@/lib/site-url";

async function loginRedirect(request: NextRequest, origin: string): Promise<NextResponse> {
  const u = new URL("/login", origin);
  u.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(u, 303);
}

/**
 * PKCE / magic-link `?code=` exchange on the **document GET** so verifier
 * cookies from `signInWithOtp` stay on the same request. Hash-only flows
 * redirect to `/auth/callback/hash` (client page).
 */
export async function GET(request: NextRequest) {
  const origin = await resolveAppOrigin();
  const url = request.nextUrl;
  const errDesc =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errDesc) {
    return loginRedirect(request, origin);
  }

  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");

  if (code) {
    let redirectResponse = NextResponse.redirect(
      new URL("/", origin),
      303,
    );

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
            const loc = redirectResponse.headers.get("Location");
            redirectResponse = NextResponse.redirect(
              loc ? new URL(loc) : new URL("/", origin),
              303,
            );
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return loginRedirect(request, origin);
    }

    const resolved = await resolveAuthCallbackAfterSession(
      supabase,
      explicitNext,
    );
    if (!resolved.ok) {
      return loginRedirect(request, origin);
    }

    const finalUrl = new URL(resolved.next, origin);
    redirectResponse.headers.set("Location", finalUrl.toString());

    if (resolved.next === "/reset-password") {
      redirectResponse.cookies.set(RECOVERY_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600,
        path: "/reset-password",
      });
    }

    return redirectResponse;
  }

  // Invite links carry tokens in the URL hash (#access_token=…). A 303 redirect
  // cannot include the fragment, so bootstrap client-side to preserve it.
  const hashPageBase = `${origin}/auth/callback/hash`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Signing in…</title></head><body><script>location.replace(${JSON.stringify(hashPageBase)} + location.search + location.hash)</script></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
