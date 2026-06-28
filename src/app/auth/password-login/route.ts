import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";
import { checkLoginRateLimit } from "@/app/login/actions";
import { isSafeInternalPath } from "@/lib/safe-redirect";
import { requestAbsoluteUrl } from "@/lib/site-url";
import { createSupabaseRouteClient } from "@/lib/supabase/route-handler";

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

function loginFail(request: NextRequest, code: string) {
  const url = requestAbsoluteUrl(request, "/login");
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

/**
 * Password sign-in via form POST. Sets Supabase session cookies on the
 * redirect response — reliable on Safari and LAN IP (192.168.x.x).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = CredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return loginFail(request, "sign_in_failed");
  }

  const limited = await checkLoginRateLimit(parsed.data.email);
  if (limited && !limited.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auth/password-login] rate limited", parsed.data.email);
    }
    return loginFail(request, "sign_in_failed");
  }

  // Placeholder location — updated after we know the destination. Cookies
  // must stay on this single response object through signInWithPassword.
  let redirectResponse = NextResponse.redirect(
    requestAbsoluteUrl(request, "/"),
    303,
  );

  const supabase = createSupabaseRouteClient(request, redirectResponse);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth/password-login] signIn failed", {
        email: parsed.data.email,
        message: error?.message,
      });
    }
    return loginFail(request, "sign_in_failed");
  }

  try {
    await ensurePersonForAuthUser({
      authUserId: data.user.id,
      email: data.user.email ?? null,
    });
  } catch (err) {
    console.error("[auth/password-login] ensurePerson failed", err);
    return loginFail(request, "sign_in_failed");
  }

  const nextRaw = String(formData.get("next") ?? "").trim();
  const destination = isSafeInternalPath(nextRaw || null)
    ? nextRaw
    : await defaultRouteForPerson(data.user.id);

  redirectResponse.headers.set(
    "Location",
    requestAbsoluteUrl(request, destination).toString(),
  );

  if (process.env.NODE_ENV === "development") {
    console.info("[auth/password-login] ok", {
      email: parsed.data.email,
      destination,
    });
  }

  return redirectResponse;
}
