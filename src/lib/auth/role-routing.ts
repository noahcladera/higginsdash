import { prisma } from "@/lib/prisma";
import type { PersonAccess, PersonKind } from "@/lib/auth/person-access";

/**
 * Resolve the post-login destination for a freshly-authenticated person.
 *
 * Priority:
 *   1. Admins → /admin (full operator dashboard)
 *   2. Active coaches → /coach (their portal, with admin toggle if also admin)
 *   3. Members (student or active membership) → /portal
 *   4. Fallback → /portal (a person with no roles yet sees the empty member
 *      portal explaining they need a membership)
 *
 * Use {@link defaultRouteForAccess} when you already have a resolved
 * `PersonAccess` to avoid a second Prisma round-trip.
 */
export async function defaultRouteForPerson(personId: string): Promise<string> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      coach: { select: { isActive: true } },
      zzpCoach: { select: { isActive: true } },
      student: { select: { personId: true } },
    },
  });
  if (!person) return "/portal";
  if (person.isAdmin) return "/admin";
  if (person.coach?.isActive) return "/coach";
  if (person.zzpCoach?.isActive && !person.coach?.isActive) return "/coach";
  return "/portal";
}

/**
 * Synchronous variant: takes an already-resolved {@link PersonAccess} (or
 * just its `kind`) and returns the same default route. Guards use this so
 * a denial doesn't trigger a second person fetch.
 */
export function defaultRouteForAccess(
  access: PersonAccess | { kind: PersonKind },
): string {
  return defaultRouteForKind(access.kind);
}

export function defaultRouteForKind(kind: PersonKind): string {
  switch (kind) {
    case "admin":
      return "/admin";
    case "staff_coach":
    case "zzp_coach":
      return "/coach";
    case "member":
    case "none":
    default:
      return "/portal";
  }
}
