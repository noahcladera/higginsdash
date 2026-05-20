import { requireAccess } from "@/lib/auth/guard";

/**
 * Any signed-in user with a non-archived `people` row.
 * Used for shared routes like `/levels` that coaches, parents, and admins
 * can all open without the portal's coach redirect.
 *
 * Identical permissions to {@link requireAuthedPerson}; kept as a separate
 * named export so existing call sites that surface `householdId` don't have
 * to be edited.
 */
export async function requireAuthenticated() {
  const access = await requireAccess({
    allow: ["admin", "staff_coach", "zzp_coach", "member", "none"],
    errorCode: "not_signed_in",
  });
  return {
    user: access.user,
    person: access.person,
    householdId: access.householdId,
  };
}
