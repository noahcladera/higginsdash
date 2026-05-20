import type { Prisma } from "@prisma/client";

const IMPOSSIBLE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Restrict class series to those tied to allowed clubs (series.club_id or venue.club_id).
 * When `allowedClubIds` is `null`, no extra filter (staff / admin — all clubs).
 * Empty array = nowhere.
 */
export function classSeriesClubScope(
  allowedClubIds: string[] | null,
): Prisma.ClassSeriesWhereInput {
  if (allowedClubIds === null) return {};
  if (allowedClubIds.length === 0) {
    return { id: { equals: IMPOSSIBLE_ID } };
  }
  return {
    OR: [
      { clubId: { in: allowedClubIds } },
      { venue: { clubId: { in: allowedClubIds } } },
    ],
  };
}

/**
 * `null` = all clubs; `[]` = none.
 */
export function clubsWhereIds(
  allowedClubIds: string[] | null,
): Prisma.ClubWhereInput {
  if (allowedClubIds === null) return {};
  if (allowedClubIds.length === 0) {
    return { id: { equals: IMPOSSIBLE_ID } };
  }
  return { id: { in: allowedClubIds } };
}

/**
 * Court bookings scoped by club (coach personal / coaching bookings).
 */
export function courtBookingClubFilter(
  allowedClubIds: string[] | null,
): Prisma.CourtBookingWhereInput {
  if (allowedClubIds === null) return {};
  if (allowedClubIds.length === 0) {
    return { id: { equals: IMPOSSIBLE_ID } };
  }
  return { clubId: { in: allowedClubIds } };
}
