/**
 * Common recipient lookups for `notify()`.
 *
 * Centralizes the "find all admins" / "find affected members on this
 * booking" / "household primary contact" queries so callers don't reinvent
 * them and we can adjust scope later (e.g. "only admins flagged as on-call")
 * in one place.
 */

import { prisma } from "@/lib/prisma";

/**
 * All active admins (people with `isAdmin=true` and not archived).
 * Used by every "request submitted, please review" notification so the
 * office sees a row in the inbox without depending on the email channel.
 */
export async function getAdminRecipients(): Promise<
  Array<{ id: string; primaryEmail: string | null }>
> {
  const admins = await prisma.person.findMany({
    where: { isAdmin: true, archivedAt: null },
    select: {
      id: true,
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true },
        take: 1,
      },
    },
  });
  return admins.map((a) => ({
    id: a.id,
    primaryEmail: a.emails[0]?.address ?? null,
  }));
}

/**
 * People who are "on" a court booking and should hear about its lifecycle:
 *  - the booker themselves
 *  - any partners with a linked `personId`
 *  - the household primary contact (if booked under a household and that
 *    contact differs from the booker)
 *
 * Returns deduplicated rows with primary email lookup so the caller can
 * fan out via in-app + email in one pass.
 */
export async function getBookingStakeholders(args: {
  bookingId: string;
  /** Optional: exclude this person id (typically the actor doing the action). */
  excludePersonId?: string | null;
}): Promise<Array<{ id: string; primaryEmail: string | null }>> {
  const booking = await prisma.courtBooking.findUnique({
    where: { id: args.bookingId },
    select: {
      bookedByPersonId: true,
      bookedByHouseholdId: true,
      partners: { select: { personId: true } },
      bookedByHousehold: {
        select: { primaryContactPersonId: true },
      },
    },
  });
  if (!booking) return [];

  const ids = new Set<string>();
  if (booking.bookedByPersonId) ids.add(booking.bookedByPersonId);
  for (const p of booking.partners) {
    if (p.personId) ids.add(p.personId);
  }
  if (booking.bookedByHousehold?.primaryContactPersonId) {
    ids.add(booking.bookedByHousehold.primaryContactPersonId);
  }
  if (args.excludePersonId) ids.delete(args.excludePersonId);
  if (ids.size === 0) return [];

  const people = await prisma.person.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true },
        take: 1,
      },
    },
  });
  return people.map((p) => ({
    id: p.id,
    primaryEmail: p.emails[0]?.address ?? null,
  }));
}
