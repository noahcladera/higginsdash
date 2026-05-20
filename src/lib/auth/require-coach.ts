import { requireCoachAccess } from "@/lib/auth/require-coach-access";

/**
 * Server-side guard for /coach/* routes and coach server actions.
 *
 * Allows access if the signed-in person is an admin OR has an active coach
 * record OR an active ZZP coach record. Returns the loaded auth user,
 * person, coach rows, club scope, and household so the caller can render
 * coach-portal UI without re-querying.
 */
export async function requireCoach() {
  return requireCoachAccess();
}
