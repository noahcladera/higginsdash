import { redirect } from "next/navigation";
import { resolveAccessDetailed } from "@/lib/auth/person-access";

/**
 * Server-side guard for /portal/* routes and member server actions.
 *
 * Anyone with a non-archived `people` row may use the portal if they:
 *   - have a Student record, OR
 *   - are an admin (admins can inspect the member portal for debugging), OR
 *   - belong to a Household (including brand-new self-signups before they
 *     buy a membership — they need the portal to reach `/portal/membership`).
 *
 * Coaches are NOT members of this portal: they live exclusively in
 * `/coach`. A non-admin coach who hits `/portal` is bounced to their
 * coach workspace **without an error code** — they didn't do anything
 * wrong, the system just sent them to their actual home. An admin who is
 * also a coach still gets portal access (admin trumps coach).
 *
 * Doesn't go through `requireAccess` because the coach-like short-circuit
 * needs to redirect with no error code, which the standard "wrong role"
 * branch can't express.
 */
export async function requireMember() {
  const resolution = await resolveAccessDetailed();

  if (resolution.state === "anonymous") {
    redirect("/login?error=not_signed_in");
  }
  if (resolution.state === "archived") {
    redirect("/login?error=account_archived");
  }

  const access = resolution.access;

  // Coaches and ZZP-only coaches (who aren't also admins) belong in /coach,
  // not /portal. Send them home silently — there's no error to show.
  if (access.isCoachLike && !access.isAdmin) {
    redirect("/coach");
  }

  if (!access.isMember) {
    redirect("/login?error=not_member");
  }

  return {
    user: access.user,
    person: access.person,
    householdId: access.householdId,
  };
}
