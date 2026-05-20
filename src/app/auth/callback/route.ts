import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { resolveAuthCallbackAfterSession } from "@/app/auth/complete-auth-callback";

function loginRedirect(request: NextRequest): NextResponse {
  const u = new URL("/login", request.nextUrl.origin);
  u.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(u, 303);
}

/**
 * PKCE / magic-link `?code=` exchange on the **document GET** so verifier
 * cookies from `signInWithOtp` stay on the same request. Hash-only flows
 * rewrite to `/auth/callback/hash` (client page).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const errDesc =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errDesc) {
    return loginRedirect(request);
  }

  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");

  if (code) {
    let redirectResponse = NextResponse.redirect(
      new URL("/", request.nextUrl.origin),
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
              loc ? new URL(loc) : new URL("/", request.nextUrl.origin),
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
      return loginRedirect(request);
    }

    const resolved = await resolveAuthCallbackAfterSession(
      supabase,
      explicitNext,
    );
    if (!resolved.ok) {
      return loginRedirect(request);
    }

    const finalUrl = new URL(resolved.next, request.nextUrl.origin);
    redirectResponse.headers.set("Location", finalUrl.toString());
    return redirectResponse;
  }

  const rewriteUrl = url.clone();
  rewriteUrl.pathname = "/auth/callback/hash";
  return NextResponse.rewrite(rewriteUrl);
}
