import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import type { Coach, Person, Student, ZzpCoach } from "@prisma/client";
import { getJwtIdentity, userFromIdentity } from "@/lib/auth/identity";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Single source of truth for "who is this signed-in user, and what kind of
 * access do they have?". Every guard (`requireAdmin`, `requireMember`,
 * `requireCoach`, etc.) resolves through this function so the classification
 * rules — staff coach vs ZZP coach, member vs household-only, archived vs
 * active — live in exactly one place.
 *
 * Kind ordering reflects highest-privilege landing routes:
 *   admin > staff_coach > zzp_coach > member > none
 * This matches `defaultRouteForAccess`.
 */

export type PersonKind =
  | "admin"
  | "staff_coach"
  | "zzp_coach"
  | "member"
  | "none";

export type PersonWithRelations = Person & {
  student: Student | null;
  coach: Coach | null;
  zzpCoach: ZzpCoach | null;
  coachClubAccess: { clubId: string }[];
  householdMember: { householdId: string } | null;
};

export interface PersonAccess {
  user: User;
  person: PersonWithRelations;
  /** Highest-privilege classification for this person right now. */
  kind: PersonKind;
  isAdmin: boolean;
  /** Has an active staff Coach row. */
  isStaffCoach: boolean;
  /** Has an active ZzpCoach row but is NOT a staff coach. */
  isZzpOnly: boolean;
  /** Either kind of coach (staff or ZZP-only). */
  isCoachLike: boolean;
  /** Eligible for the member portal: student, admin, or in a household. */
  isMember: boolean;
  householdId: string | null;
  /**
   * Coach club scope. `null` = all clubs (staff/admin defaults).
   * Empty array for ZZP coach with no rows = no clubs allowed.
   * Set only for coach-like people; otherwise irrelevant (we still populate
   * conservatively to keep call sites simple).
   */
  allowedClubIds: string[] | null;
}

function resolveAllowedClubIds(
  kind: PersonKind,
  rows: { clubId: string }[],
): string[] | null {
  if (kind === "admin" || kind === "staff_coach") {
    return rows.length === 0 ? null : rows.map((r) => r.clubId);
  }
  if (kind === "zzp_coach") {
    // ZZP with no rows means nowhere; we expose [] rather than null.
    return rows.map((r) => r.clubId);
  }
  return null;
}

function classify(person: PersonWithRelations): {
  kind: PersonKind;
  isStaffCoach: boolean;
  isZzpOnly: boolean;
  isMember: boolean;
} {
  const isStaffCoach = person.coach?.isActive === true;
  const isZzpOnly =
    person.zzpCoach?.isActive === true && !isStaffCoach;
  const householdId = person.householdMember?.householdId ?? null;
  const isMember =
    !!person.student || person.isAdmin || householdId != null;

  let kind: PersonKind;
  if (person.isAdmin) kind = "admin";
  else if (isStaffCoach) kind = "staff_coach";
  else if (isZzpOnly) kind = "zzp_coach";
  else if (isMember) kind = "member";
  else kind = "none";

  return { kind, isStaffCoach, isZzpOnly, isMember };
}

/**
 * Returns `null` when there is no signed-in user, or when the signed-in user
 * has no `people` row, or when that row is archived. Callers decide whether
 * `null` means "redirect to /login" or something more nuanced.
 */
/**
 * Wrapped in `React.cache` so the layout, page, and any server actions in
 * the same request all share one Supabase auth call + one Prisma fetch.
 * Without this, `requireMember` re-runs everything every time it's called.
 */
export const resolvePersonAccess = cache(
  async (): Promise<PersonAccess | null> => {
    const supabase = await createSupabaseServerClient();
    // Local JWT verification — no network call on the hot path. The
    // synthesised User keeps the public PersonAccess.user contract for
    // call sites that read user.email; fields not in the JWT are left
    // empty since nothing in the codebase reads them outside the
    // login/signup flows (which call supabase.auth.getUser directly).
    const identity = await getJwtIdentity(supabase);
    if (!identity) return null;

    const person = await prisma.person.findUnique({
      where: { id: identity.id },
      include: {
        student: true,
        coach: true,
        zzpCoach: true,
        coachClubAccess: { select: { clubId: true } },
        householdMember: { select: { householdId: true } },
      },
    });
    if (!person || person.archivedAt) return null;

    const { kind, isStaffCoach, isZzpOnly, isMember } = classify(person);
    const householdId = person.householdMember?.householdId ?? null;

    return {
      user: userFromIdentity(identity),
      person,
      kind,
      isAdmin: person.isAdmin,
      isStaffCoach,
      isZzpOnly,
      isCoachLike: isStaffCoach || isZzpOnly,
      isMember,
      householdId,
      allowedClubIds: resolveAllowedClubIds(kind, person.coachClubAccess),
    };
  },
);

/**
 * Same as {@link resolvePersonAccess} but distinguishes "no session" from
 * "session but archived/missing person row". Useful for guards that want
 * to send archived users to `/login?error=account_archived` instead of the
 * generic `/login`.
 */
export type AccessResolution =
  | { state: "anonymous" }
  | { state: "archived"; user: User }
  | { state: "ok"; access: PersonAccess };

/** Wrapped in `React.cache` — see {@link resolvePersonAccess} for rationale. */
export const resolveAccessDetailed = cache(
  async (): Promise<AccessResolution> => {
    const supabase = await createSupabaseServerClient();
    const identity = await getJwtIdentity(supabase);
    if (!identity) return { state: "anonymous" };

    const person = await prisma.person.findUnique({
      where: { id: identity.id },
      include: {
        student: true,
        coach: true,
        zzpCoach: true,
        coachClubAccess: { select: { clubId: true } },
        householdMember: { select: { householdId: true } },
      },
    });
    if (!person || person.archivedAt) {
      return { state: "archived", user: userFromIdentity(identity) };
    }

    const { kind, isStaffCoach, isZzpOnly, isMember } = classify(person);
    const householdId = person.householdMember?.householdId ?? null;

    return {
      state: "ok",
      access: {
        user: userFromIdentity(identity),
        person,
        kind,
        isAdmin: person.isAdmin,
        isStaffCoach,
        isZzpOnly,
        isCoachLike: isStaffCoach || isZzpOnly,
        isMember,
        householdId,
        allowedClubIds: resolveAllowedClubIds(kind, person.coachClubAccess),
      },
    };
  },
);
