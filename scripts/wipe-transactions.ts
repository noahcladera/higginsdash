/**
 * Wipe every transaction-shaped row from the database (full reset).
 *
 * Why: after the Mollie split + sequential checkout changes the
 * existing memberships / enrollments / bookings / payments are
 * difficult to reconcile against the new pricing & two-payment model.
 * This script gives the demo a clean slate without touching people,
 * households, students, classes, courts, coaches, programs, settings,
 * or any other catalog/account data.
 *
 * What it deletes (in a single $transaction, FK-safe order):
 *   - notifications, audit_log
 *   - refunds, payment_lines
 *   - attendance, enrollments
 *   - coach_sub_requests
 *   - ladder_awards, ladder_matches, ladder_availability,
 *     ladder_entries, ladder_seasons
 *   - court_booking_partners, court_bookings
 *   - recurring_blocks
 *   - membership_clubs, memberships
 *   - trial_interests
 *   - payments
 *
 * Run:
 *   npm run db:wipe-transactions
 */

import { PrismaClient } from "@prisma/client";
import { assertDestructiveConfirmed } from "./_safety";

const prisma = new PrismaClient();

interface StepResult {
  table: string;
  before: number;
  deleted: number;
}

async function main() {
  assertDestructiveConfirmed("db:wipe-transactions");
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Run via `npm run db:wipe-transactions` so it loads .env.local.",
    );
    process.exit(1);
  }

  console.log("=== wipe-transactions: full reset ===");
  console.log(
    "Deleting memberships, enrollments, court bookings, payments,",
  );
  console.log(
    "ladder data, recurring blocks, trial interests, notifications,",
  );
  console.log("and audit log. People/classes/catalog stay intact.\n");

  const beforeCounts = await collectCounts();
  printCounts("Before", beforeCounts);

  const results: StepResult[] = await prisma.$transaction(async (tx) => {
    const out: StepResult[] = [];

    async function step(
      table: string,
      runDelete: () => Promise<{ count: number }>,
      runCount: () => Promise<number>,
    ) {
      const before = await runCount();
      const r = await runDelete();
      out.push({ table, before, deleted: r.count });
      console.log(`${table.padEnd(28)} deleted ${r.count} (was ${before})`);
    }

    // 1. Loose-FK tables first so dangling references don't matter later.
    await step(
      "notifications",
      () => tx.notification.deleteMany({}),
      () => tx.notification.count(),
    );
    await step(
      "audit_log",
      () => tx.auditLog.deleteMany({}),
      () => tx.auditLog.count(),
    );

    // 2. Payment side-effects (refunds + lines) before the rows the
    //    lines reference (enrollments, memberships, court_bookings,
    //    recurring_blocks). Payments themselves are deleted last so
    //    everything that FKs into them (payment_lines, ladder_entries,
    //    refunds) is already gone.
    await step(
      "refunds",
      () => tx.refund.deleteMany({}),
      () => tx.refund.count(),
    );
    await step(
      "payment_lines",
      () => tx.paymentLine.deleteMany({}),
      () => tx.paymentLine.count(),
    );

    // 3. Enrollment graph.
    await step(
      "attendance",
      () => tx.attendance.deleteMany({}),
      () => tx.attendance.count(),
    );
    await step(
      "enrollments",
      () => tx.enrollment.deleteMany({}),
      () => tx.enrollment.count(),
    );

    // 4. Coach sub-requests reference class sessions but no transactions.
    await step(
      "coach_sub_requests",
      () => tx.coachSubRequest.deleteMany({}),
      () => tx.coachSubRequest.count(),
    );

    // 5. Booking graph.
    await step(
      "court_booking_partners",
      () => tx.courtBookingPartner.deleteMany({}),
      () => tx.courtBookingPartner.count(),
    );
    await step(
      "court_bookings",
      () => tx.courtBooking.deleteMany({}),
      () => tx.courtBooking.count(),
    );

    // 7. Recurring blocks
    await step(
      "recurring_blocks",
      () => tx.recurringBlock.deleteMany({}),
      () => tx.recurringBlock.count(),
    );

    // 8. Memberships (clubs first via FK).
    await step(
      "membership_clubs",
      () => tx.membershipClub.deleteMany({}),
      () => tx.membershipClub.count(),
    );
    await step(
      "memberships",
      () => tx.membership.deleteMany({}),
      () => tx.membership.count(),
    );

    // 9. Trial interest is standalone — wipe so the inbox starts clean.
    await step(
      "trial_interests",
      () => tx.trialInterest.deleteMany({}),
      () => tx.trialInterest.count(),
    );

    // 10. Payments last — every row that FKs in is now gone.
    await step(
      "payments",
      () => tx.payment.deleteMany({}),
      () => tx.payment.count(),
    );

    return out;
  });

  const afterCounts = await collectCounts();
  console.log("");
  printCounts("After", afterCounts);

  const totalDeleted = results.reduce((acc, r) => acc + r.deleted, 0);
  console.log(`\nDone. ${totalDeleted} rows removed across ${results.length} tables.`);
}

interface AllCounts {
  notifications: number;
  audit_log: number;
  refunds: number;
  payment_lines: number;
  attendance: number;
  enrollments: number;
  coach_sub_requests: number;
  ladder_awards: number;
  ladder_matches: number;
  ladder_availability: number;
  ladder_entries: number;
  ladder_seasons: number;
  court_booking_partners: number;
  court_bookings: number;
  recurring_blocks: number;
  membership_clubs: number;
  memberships: number;
  trial_interests: number;
  payments: number;
}

async function collectCounts(): Promise<AllCounts> {
  const [
    notifications,
    audit_log,
    refunds,
    payment_lines,
    attendance,
    enrollments,
    coach_sub_requests,
    ladder_awards,
    ladder_matches,
    ladder_availability,
    ladder_entries,
    ladder_seasons,
    court_booking_partners,
    court_bookings,
    recurring_blocks,
    membership_clubs,
    memberships,
    trial_interests,
    payments,
  ] = await Promise.all([
    prisma.notification.count(),
    prisma.auditLog.count(),
    prisma.refund.count(),
    prisma.paymentLine.count(),
    prisma.attendance.count(),
    prisma.enrollment.count(),
    prisma.coachSubRequest.count(),
    prisma.ladderAward.count(),
    prisma.ladderMatch.count(),
    prisma.ladderAvailability.count(),
    prisma.ladderEntry.count(),
    prisma.ladderSeason.count(),
    prisma.courtBookingPartner.count(),
    prisma.courtBooking.count(),
    prisma.recurringBlock.count(),
    prisma.membershipClub.count(),
    prisma.membership.count(),
    prisma.trialInterest.count(),
    prisma.payment.count(),
  ]);
  return {
    notifications,
    audit_log,
    refunds,
    payment_lines,
    attendance,
    enrollments,
    coach_sub_requests,
    ladder_awards,
    ladder_matches,
    ladder_availability,
    ladder_entries,
    ladder_seasons,
    court_booking_partners,
    court_bookings,
    recurring_blocks,
    membership_clubs,
    memberships,
    trial_interests,
    payments,
  };
}

function printCounts(label: string, counts: AllCounts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`${label}:`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log(`  ${"TOTAL".padEnd(28)} ${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
