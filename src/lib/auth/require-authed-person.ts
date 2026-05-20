import { requireAccess } from "@/lib/auth/guard";

/**
 * Minimal guard: signed-in Supabase user with a non-archived `people` row.
 * Use for self-serve profile/password updates and shared logged-in pages
 * (e.g. `/lights`, `/levels`) — **not** for portal-only routes (use
 * {@link requireMember} there).
 */
export async function requireAuthedPerson() {
  const access = await requireAccess({
    allow: ["admin", "staff_coach", "zzp_coach", "member", "none"],
    // Unreachable in practice (every kind is allowed) but required by the
    // shared `requireAccess` signature; keep it specific so an accidental
    // future tightening produces a sensible message.
    errorCode: "not_signed_in",
  });
  return { user: access.user, person: access.person };
}
