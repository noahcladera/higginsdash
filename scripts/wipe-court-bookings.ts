/**
 * Wipe every court booking from the database (no other data touched).
 *
 * Useful for getting a clean slate before a demo / presentation.
 *
 * What it does, in a single transaction:
 *   1. Counts current court_bookings.
 *   2. NULLs out ladder_matches.court_booking_id (preserves matches).
 *   3. Deletes payment_lines that reference a court booking. Payments
 *      themselves are kept (they may have other lines / be membership /
 *      enrollment payments). If a payment ends up with zero lines that
 *      can be cleaned later if desired — out of scope here.
 *   4. Deletes all court_booking_partners (cascade also handles this,
 *      but we delete explicitly so the count is reported).
 *   5. Deletes all court_bookings.
 *
 * Run: `npm run db:wipe-bookings`
 */
import { PrismaClient } from "@prisma/client";
import { assertDestructiveConfirmed } from "./_safety";

const prisma = new PrismaClient();

async function main() {
  assertDestructiveConfirmed("db:wipe-bookings (court bookings)");
  const before = await prisma.courtBooking.count();
  console.log(`court_bookings before: ${before}`);

  if (before === 0) {
    console.log("Nothing to delete. Done.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const matches = await tx.ladderMatch.updateMany({
      where: { courtBookingId: { not: null } },
      data: { courtBookingId: null },
    });
    console.log(`ladder_matches unlinked:       ${matches.count}`);

    const payLines = await tx.paymentLine.deleteMany({
      where: { courtBookingId: { not: null } },
    });
    console.log(`payment_lines deleted:         ${payLines.count}`);

    const partners = await tx.courtBookingPartner.deleteMany({});
    console.log(`court_booking_partners deleted: ${partners.count}`);

    const bookings = await tx.courtBooking.deleteMany({});
    console.log(`court_bookings deleted:        ${bookings.count}`);
  });

  const after = await prisma.courtBooking.count();
  console.log(`\ncourt_bookings after:  ${after}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
