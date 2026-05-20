/**
 * Hard-coded UUIDs for synthetic "system" rows that the seed creates so that
 * catalog data which requires a person/household FK has something to attach to.
 *
 * They are NOT real users and must be excluded from any "first real user"
 * checks (admin promotion, member counts shown to admins, etc.).
 *
 * Mirrored in `prisma/seed.ts` (imported from there too).
 */
export const SYSTEM_PERSON_ID = "00000000-0000-0000-0000-000000000001";
export const SYSTEM_HOUSEHOLD_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Synthetic "NO COACH YET" placeholder coach. Assigned to any ClassSeries
 * that an admin has created but not yet staffed. Always present, never
 * logs in, never shows in real coach leaderboards — exclude via
 * `SYSTEM_PERSON_IDS` like the System person.
 */
export const SYSTEM_NO_COACH_PERSON_ID = "00000000-0000-0000-0000-000000000003";

/** Convenience array for `where: { id: { notIn: SYSTEM_PERSON_IDS } }`. */
export const SYSTEM_PERSON_IDS = [
  SYSTEM_PERSON_ID,
  SYSTEM_NO_COACH_PERSON_ID,
] as const;
