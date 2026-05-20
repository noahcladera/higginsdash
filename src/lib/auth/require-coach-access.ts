import type { User } from "@supabase/supabase-js";
import type { Coach, Person, ZzpCoach } from "@prisma/client";
import { requireAccess } from "@/lib/auth/guard";

export type CoachAccessKind = "admin" | "staff" | "zzp";

export type CoachAccessResult = {
  user: User;
  person: Person & {
    coach: Coach | null;
    zzpCoach: ZzpCoach | null;
  };
  kind: CoachAccessKind;
  coach: Coach | null;
  zzpCoach: ZzpCoach | null;
  /** `null` = all clubs (staff/admin). Empty array = no clubs allowed (ZZP with no rows). */
  allowedClubIds: string[] | null;
  householdId: string | null;
};

/**
 * Server-side guard for /coach/* (workspace). Allows admins, active HTN
 * coaches, or active ZZP coaches. Returns scoped club ids for booking /
 * filtering.
 *
 * Built on top of {@link requireAccess}, which means a signed-in member who
 * tries to reach /coach is bounced to /portal?error=not_coach (not /login).
 */
export async function requireCoachAccess(): Promise<CoachAccessResult> {
  const access = await requireAccess({
    allow: ["admin", "staff_coach", "zzp_coach"],
    errorCode: "not_coach",
  });

  const kind: CoachAccessKind =
    access.kind === "admin"
      ? "admin"
      : access.kind === "staff_coach"
        ? "staff"
        : "zzp";

  return {
    user: access.user,
    person: access.person,
    kind,
    coach: access.person.coach,
    zzpCoach: access.person.zzpCoach,
    allowedClubIds: access.allowedClubIds,
    householdId: access.householdId,
  };
}
