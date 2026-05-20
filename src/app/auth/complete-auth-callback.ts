import type { SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { ensurePersonForAuthUser } from "@/lib/auth/ensure-person";
import { defaultRouteForPerson } from "@/lib/auth/role-routing";
import { isSafeInternalPath } from "@/lib/safe-redirect";

export type AuthCallbackResult =
  | { ok: true; next: string }
  | { ok: false; error: string };

/**
 * Shared post-auth routing: assumes Supabase already has a session (after
 * PKCE exchange, password sign-in, or hash/setSession on the client).
 */
export async function resolveAuthCallbackAfterSession(
  supabase: SupabaseClient,
  explicitNext: string | null,
): Promise<AuthCallbackResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "no_session" };
  }

  await ensurePersonForAuthUser({
    authUserId: user.id,
    email: user.email ?? null,
  });

  const userEmail = user.email;

  if (userEmail) {
    const pendingInvite = await prisma.coachInvite.findFirst({
      where: {
        email: userEmail.trim().toLowerCase(),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });
    if (pendingInvite) {
      return {
        ok: true,
        next: `/coach/accept-invite?token=${encodeURIComponent(pendingInvite.token)}`,
      };
    }
  }

  const next = isSafeInternalPath(explicitNext)
    ? explicitNext
    : await defaultRouteForPerson(user.id);

  return { ok: true, next };
}
