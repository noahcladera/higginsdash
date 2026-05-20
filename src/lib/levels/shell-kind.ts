import type { Coach, Person, Student, ZzpCoach } from "@prisma/client";

export type PersonForLevelsShell = Person & {
  coach: Coach | null;
  zzpCoach: ZzpCoach | null;
  student: Student | null;
  householdMember: { householdId: string } | null;
};

/**
 * Anyone whose primary role is "coach" — staff or ZZP — uses the coach
 * chrome on `/levels`. This matches `requireMember`, which sends both
 * groups to `/coach`, and `requireCoachAccess`, which classifies ZZP-only
 * users as `kind: "zzp"`. Admins (even if also coaching) keep the member
 * portal chrome here so they can browse levels without leaving "admin
 * thinking" mode; they have explicit switch links to jump back.
 */
export function getLevelsShellKind(
  person: PersonForLevelsShell,
): "coach" | "portal" {
  if (person.isAdmin) return "portal";
  const isStaffCoach = person.coach?.isActive === true;
  const isZzpCoach = person.zzpCoach?.isActive === true;
  if (isStaffCoach || isZzpCoach) return "coach";
  return "portal";
}
