import { redirect } from "next/navigation";
import {
  resolveAccessDetailed,
  type PersonAccess,
  type PersonKind,
} from "@/lib/auth/person-access";
import { defaultRouteForAccess } from "@/lib/auth/role-routing";

/**
 * Canonical set of error codes that flow through `?error=` query strings.
 * The login page (when the user is anonymous) and the default-home pages
 * (when the user is signed in but lacks the required role) consume them
 * via `LoginErrorBanner` / `RoleDenialBanner` — keep this list and the
 * banner copy in sync.
 */
export type AuthErrorCode =
  | "not_signed_in"
  | "not_member"
  | "not_admin"
  | "not_coach"
  | "account_archived";

export interface RequireAccessOptions {
  /** Person kinds permitted to enter. Empty array = nobody. */
  allow: ReadonlyArray<PersonKind>;
  /**
   * Error code attached to the redirect when the signed-in user is not in
   * `allow`. Also used for the anonymous case (see `anonymousErrorCode`).
   */
  errorCode: AuthErrorCode;
  /**
   * Override the error code for the anonymous (no Supabase user) case.
   * Defaults to `"not_signed_in"`.
   */
  anonymousErrorCode?: AuthErrorCode;
}

/**
 * Single primitive that all named guards (`requireAdmin`, `requireMember`,
 * `requireCoach`, `requireAuthedPerson`, `requireAuthenticated`) flow
 * through. Behaviour on denial:
 *
 *   - **Anonymous** (no Supabase session) →
 *     `redirect("/login?error=<anonymousErrorCode>")`. Middleware already
 *     catches most of these before guards run; this is the belt-and-braces
 *     fallback.
 *   - **Archived person row** →
 *     `redirect("/login?error=account_archived")`. Their session still
 *     exists but they can't reach any portal.
 *   - **Signed in, wrong role** →
 *     `redirect("<defaultRouteForAccess>?error=<errorCode>")`. We send
 *     them to the home they CAN reach (admin → /admin, coach → /coach,
 *     member → /portal) instead of bouncing to /login. The destination
 *     page can render a banner explaining why we redirected them.
 */
export async function requireAccess(
  opts: RequireAccessOptions,
): Promise<PersonAccess> {
  const resolution = await resolveAccessDetailed();

  if (resolution.state === "anonymous") {
    const code = opts.anonymousErrorCode ?? "not_signed_in";
    redirect(`/login?error=${code}`);
  }

  if (resolution.state === "archived") {
    redirect(`/login?error=account_archived`);
  }

  const access = resolution.access;
  if (!opts.allow.includes(access.kind)) {
    const home = defaultRouteForAccess(access);
    redirect(`${home}?error=${opts.errorCode}`);
  }

  return access;
}
