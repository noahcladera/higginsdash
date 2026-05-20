import { requireAccess } from "@/lib/auth/guard";

/**
 * Server-side guard for /admin/* routes and admin server actions.
 *
 * Behavior:
 *   - No Supabase session → /login?error=not_signed_in (middleware usually
 *     catches this first, but the guard is defensive).
 *   - Archived people row → /login?error=account_archived.
 *   - Signed in but not admin → bounced to their own home with
 *     `?error=not_admin` (e.g. coaches land on /coach, members on /portal),
 *     so multi-role users don't get kicked back to /login when navigating
 *     between portals.
 *
 * Returns the loaded auth user / person so callers can render without
 * re-querying. The `person` shape now includes the standard relations
 * (`coach`, `zzpCoach`, `student`, `householdMember`, `coachClubAccess`)
 * since they all come from the unified resolution; older callers that
 * only used `firstName`/`lastName`/`isAdmin` continue to work unchanged.
 */
export async function requireAdmin() {
  const access = await requireAccess({
    allow: ["admin"],
    errorCode: "not_admin",
  });
  return { user: access.user, person: access.person };
}
