/**
 * Hard wipe of every class-related row in the database.
 *
 * Removes:
 *   - attendance
 *   - class_session_coaches
 *   - class_sessions
 *   - class_series_coaches
 *   - enrollments  (and any payment_lines that reference them)
 *   - class_series
 *
 * Leaves untouched:
 *   - seasons, programs, venues, courts, schools, school_partnerships
 *   - people, students, coaches, households, memberships
 *   - payments themselves (only the per-enrollment payment_line rows go)
 *
 * Run: `npm run db:wipe-classes`
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Wiping all class data…\n");

  // Snapshot before for reporting.
  const before = {
    series: await prisma.classSeries.count(),
    sessions: await prisma.classSession.count(),
    seriesCoaches: await prisma.classSeriesCoach.count(),
    sessionCoaches: await prisma.classSessionCoach.count(),
    enrollments: await prisma.enrollment.count(),
    attendance: await prisma.attendance.count(),
  };
  console.log("Before:", before, "\n");

  // payment_lines that point at enrollments — delete first so the
  // enrollment delete (or its cascade from class_series) doesn't trip
  // the FK. We only nuke lines that reference an enrollment; lines for
  // memberships, court bookings, recurring blocks, etc. are untouched.
  const enrollmentIds = (
    await prisma.enrollment.findMany({ select: { id: true } })
  ).map((e) => e.id);

  if (enrollmentIds.length > 0) {
    const pl = await prisma.paymentLine.deleteMany({
      where: { enrollmentId: { in: enrollmentIds } },
    });
    console.log(`Deleted payment_lines (enrollment-linked): ${pl.count}`);
  } else {
    console.log("Deleted payment_lines (enrollment-linked): 0");
  }

  // Now everything below cascades from class_series, but we delete each
  // table explicitly for visible counts and to surface anything weird.
  const att = await prisma.attendance.deleteMany({});
  console.log(`Deleted attendance: ${att.count}`);

  const sCoach = await prisma.classSessionCoach.deleteMany({});
  console.log(`Deleted class_session_coaches: ${sCoach.count}`);

  const sess = await prisma.classSession.deleteMany({});
  console.log(`Deleted class_sessions: ${sess.count}`);

  const seriesCoach = await prisma.classSeriesCoach.deleteMany({});
  console.log(`Deleted class_series_coaches: ${seriesCoach.count}`);

  const enr = await prisma.enrollment.deleteMany({});
  console.log(`Deleted enrollments: ${enr.count}`);

  const series = await prisma.classSeries.deleteMany({});
  console.log(`Deleted class_series: ${series.count}`);

  const after = {
    series: await prisma.classSeries.count(),
    sessions: await prisma.classSession.count(),
    seriesCoaches: await prisma.classSeriesCoach.count(),
    sessionCoaches: await prisma.classSessionCoach.count(),
    enrollments: await prisma.enrollment.count(),
    attendance: await prisma.attendance.count(),
  };
  console.log("\nAfter:", after);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
