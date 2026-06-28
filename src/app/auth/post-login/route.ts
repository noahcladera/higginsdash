import { type NextRequest, NextResponse } from "next/server";

import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { requestAbsoluteUrl } from "@/lib/site-url";
import { createSupabaseRouteClient } from "@/lib/supabase/route-handler";

/**
 * Fallback landing after legacy client-side sign-in. Prefer POST
 * /auth/password-login which sets cookies on the redirect response.
 */
export async function GET(request: NextRequest) {
  let redirectResponse = NextResponse.redirect(
    requestAbsoluteUrl(request, "/"),
    303,
  );

  const supabase = createSupabaseRouteClient(request, redirectResponse);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const loginUrl = requestAbsoluteUrl(request, "/login");
  loginUrl.searchParams.set("error", "not_signed_in");

  if (!user) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[auth/post-login] no session — use POST /auth/password-login instead",
      );
    }
    return NextResponse.redirect(loginUrl, 303);
  }

  await ensurePersonForAuthUser({
    authUserId: user.id,
    email: user.email ?? null,
  });

  const nextParam = request.nextUrl.searchParams.get("next");
  const destination = isSafeInternalPath(nextParam)
    ? nextParam!
    : await defaultRouteForPerson(user.id);

  redirectResponse.headers.set(
    "Location",
    requestAbsoluteUrl(request, destination).toString(),
  );

  return redirectResponse;
}
