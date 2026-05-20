/**
 * "Who is actually on the floor for this session?"
 *
 * The schema splits coach assignments into two tables:
 *   - `ClassSeriesCoach`  — the default lineup for every session in
 *     a series (the normal happy path).
 *   - `ClassSessionCoach` — per-session overrides (subs, extras).
 *
 * Anywhere that needs the *effective* lineup (admin dashboard, coach
 * calendar, etc.) needs to merge those two so series defaults still
 * show up when no per-session override exists. Doing it in one place
 * keeps the rules consistent.
 *
 * Rules (mirroring `SessionCoachesCell` on the admin class detail
 * page):
 *   1. Start with series defaults.
 *   2. Drop anyone whose personId is in the session-level subs'
 *      `substitutingForPersonId` (they were subbed out).
 *   3. Drop anyone whose personId already appears in the session-
 *      level rows (the override wins — avoid duplicates).
 *   4. Append every session-level row, carrying `isSubstitute` so
 *      callers can show a "sub" badge.
 */

export interface CoachPersonShape {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface SeriesCoachInput {
  coachPersonId: string;
  role: string;
  coach: { person: CoachPersonShape };
}

export interface SessionCoachInput {
  coachPersonId: string;
  role: string;
  isSubstitute: boolean;
  substitutingForPersonId: string | null;
  coach: { person: CoachPersonShape };
}

export interface EffectiveCoach {
  personId: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  /** True only for per-session subs; series defaults are never subs. */
  isSubstitute: boolean;
}

export function mergeEffectiveCoaches(
  seriesCoaches: SeriesCoachInput[],
  sessionCoaches: SessionCoachInput[],
): EffectiveCoach[] {
  const subbedOut = new Set(
    sessionCoaches
      .filter((c) => c.isSubstitute && c.substitutingForPersonId)
      .map((c) => c.substitutingForPersonId as string),
  );
  const overrideIds = new Set(sessionCoaches.map((c) => c.coachPersonId));

  const out: EffectiveCoach[] = [];
  for (const sc of seriesCoaches) {
    if (subbedOut.has(sc.coachPersonId)) continue;
    if (overrideIds.has(sc.coachPersonId)) continue;
    out.push({
      personId: sc.coach.person.id,
      firstName: sc.coach.person.firstName,
      lastName: sc.coach.person.lastName,
      role: sc.role,
      isSubstitute: false,
    });
  }
  for (const sc of sessionCoaches) {
    out.push({
      personId: sc.coach.person.id,
      firstName: sc.coach.person.firstName,
      lastName: sc.coach.person.lastName,
      role: sc.role,
      isSubstitute: sc.isSubstitute,
    });
  }
  return out;
}
