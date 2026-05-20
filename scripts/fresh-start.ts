/**
 * Production-prep reset: wipe all operational data and keep a single admin.
 *
 * Keeps:
 *   - Organization config (branding, features, terminology)
 *   - Infrastructure catalog (clubs, venues, courts, schools, booking_settings)
 *   - System placeholder person / household / "NO COACH YET" coach
 *   - One admin account (default: noah@higginstennis.nl)
 *
 * Removes:
 *   - All other people + Supabase auth users
 *   - Programs, seasons, classes, enrollments, payments, bookings, memberships
 *   - Notifications, audit log, trial interests, ladder data, etc.
 *
 * Usage:
 *   CONFIRM=yes npm run db:fresh-start
 *
 * Optional:
 *   KEEP_ADMIN_EMAIL=you@example.com CONFIRM=yes npm run db:fresh-start
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import {
  SYSTEM_HOUSEHOLD_ID,
  SYSTEM_NO_COACH_PERSON_ID,
  SYSTEM_PERSON_ID,
  SYSTEM_PERSON_IDS,
} from "../src/lib/system-ids";

const prisma = new PrismaClient();

const DEFAULT_KEEP_ADMIN_EMAIL = "noah@higginstennis.nl";

async function deleteStep(
  label: string,
  run: () => Promise<{ count: number }>,
): Promise<number> {
  const r = await run();
  console.log(`  ${label.padEnd(36)} ${r.count}`);
  return r.count;
}

async function main() {
  if (process.env.CONFIRM !== "yes") {
    console.error(
      "Refusing to run. This permanently deletes almost all data in the database.\n" +
        "  Re-run with: CONFIRM=yes npm run db:fresh-start",
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Run via npm run db:fresh-start (loads .env.local).",
    );
    process.exit(1);
  }

  const keepEmail = (
    process.env.KEEP_ADMIN_EMAIL ?? DEFAULT_KEEP_ADMIN_EMAIL
  ).toLowerCase();

  console.log("=== fresh-start: wipe operational data ===\n");
  console.log(`Keeping admin email: ${keepEmail}`);
  console.log(
    "Keeping infrastructure: organization, clubs, venues, courts, schools, booking_settings\n",
  );

  const adminEmail = await prisma.emailAddress.findFirst({
    where: { address: { equals: keepEmail, mode: "insensitive" } },
    select: {
      personId: true,
      person: {
        select: { id: true, firstName: true, lastName: true, isAdmin: true },
      },
    },
  });

  if (!adminEmail) {
    console.error(
      `\nNo person found with email ${keepEmail}. Aborting so you don't lock yourself out.`,
    );
    process.exit(1);
  }

  if (!adminEmail.person.isAdmin) {
    await prisma.person.update({
      where: { id: adminEmail.personId },
      data: { isAdmin: true },
    });
    console.log(
      `  (promoted ${adminEmail.person.firstName} ${adminEmail.person.lastName} to admin)\n`,
    );
  } else {
    console.log(
      `  admin: ${adminEmail.person.firstName} ${adminEmail.person.lastName} (${adminEmail.personId})\n`,
    );
  }

  const keepIds = new Set<string>([
    SYSTEM_PERSON_ID,
    SYSTEM_NO_COACH_PERSON_ID,
    adminEmail.personId,
  ]);

  console.log("Phase 1 — transactions & activity");
  await prisma.$transaction(async (tx) => {
    await deleteStep("notifications", () => tx.notification.deleteMany({}));
    await deleteStep("audit_log", () => tx.auditLog.deleteMany({}));
    await deleteStep("calendar_feed_tokens", () =>
      tx.calendarFeedToken.deleteMany({}),
    );
    await deleteStep("refunds", () => tx.refund.deleteMany({}));
    await deleteStep("payment_lines", () => tx.paymentLine.deleteMany({}));
    await deleteStep("class_transfer_requests", () =>
      tx.classTransferRequest.deleteMany({}),
    );
    await deleteStep("household_credits", () =>
      tx.householdCredit.deleteMany({}),
    );
    await deleteStep("enrollment_level_reviews", () =>
      tx.enrollmentLevelReview.deleteMany({}),
    );
    await deleteStep("class_updates", () => tx.classUpdate.deleteMany({}));
    await deleteStep("coach_sub_requests", () =>
      tx.coachSubRequest.deleteMany({}),
    );
    await deleteStep("ladder_awards", () => tx.ladderAward.deleteMany({}));
    await deleteStep("ladder_matches", () => tx.ladderMatch.deleteMany({}));
    await deleteStep("ladder_availability", () =>
      tx.ladderAvailability.deleteMany({}),
    );
    await deleteStep("ladder_entries", () => tx.ladderEntry.deleteMany({}));
    await deleteStep("ladder_seasons", () => tx.ladderSeason.deleteMany({}));
    await deleteStep("court_booking_partners", () =>
      tx.courtBookingPartner.deleteMany({}),
    );
    await deleteStep("court_bookings", () => tx.courtBooking.deleteMany({}));
    await deleteStep("recurring_blocks", () =>
      tx.recurringBlock.deleteMany({}),
    );
    await deleteStep("membership_clubs", () =>
      tx.membershipClub.deleteMany({}),
    );
    await deleteStep("memberships", () => tx.membership.deleteMany({}));
    await deleteStep("trial_interests", () => tx.trialInterest.deleteMany({}));
    await deleteStep("payments", () => tx.payment.deleteMany({}));
  });

  console.log("\nPhase 2 — classes & catalog content");
  await prisma.$transaction(async (tx) => {
    await deleteStep("attendance", () => tx.attendance.deleteMany({}));
    await deleteStep("class_session_coach_groups", () =>
      tx.classSessionCoachGroup.deleteMany({}),
    );
    await deleteStep("class_session_coaches", () =>
      tx.classSessionCoach.deleteMany({}),
    );
    await deleteStep("class_sessions", () => tx.classSession.deleteMany({}));
    await deleteStep("class_series_coach_groups", () =>
      tx.classSeriesCoachGroup.deleteMany({}),
    );
    await deleteStep("class_series_coaches", () =>
      tx.classSeriesCoach.deleteMany({}),
    );
    await deleteStep("enrollments", () => tx.enrollment.deleteMany({}));
    await deleteStep("class_series_groups", () =>
      tx.classSeriesGroup.deleteMany({}),
    );
    await deleteStep("class_series", () => tx.classSeries.deleteMany({}));
    await deleteStep("school_partnerships", () =>
      tx.schoolPartnership.deleteMany({}),
    );
    await deleteStep("seasons", () => tx.season.deleteMany({}));
    await deleteStep("programs", () => tx.program.deleteMany({}));
  });

  console.log("\nPhase 3 — people (CRM)");
  await prisma.$transaction(async (tx) => {
    await deleteStep("student_level_progress", () =>
      tx.studentLevelProgress.deleteMany({}),
    );
    await deleteStep("student_skill_history", () =>
      tx.studentSkillHistory.deleteMany({}),
    );
    await deleteStep("household_members", () =>
      tx.householdMember.deleteMany({
        where: { personId: { notIn: [...keepIds] } },
      }),
    );

    await tx.household.updateMany({
      where: { id: { not: SYSTEM_HOUSEHOLD_ID } },
      data: { primaryContactPersonId: SYSTEM_PERSON_ID },
    });
    await deleteStep("households", () =>
      tx.household.deleteMany({ where: { id: { not: SYSTEM_HOUSEHOLD_ID } } }),
    );

    await deleteStep("coach_availability", () =>
      tx.coachAvailability.deleteMany({}),
    );
    await deleteStep("coach_invites", () => tx.coachInvite.deleteMany({}));
    await deleteStep("coach_club_access", () =>
      tx.coachClubAccess.deleteMany({}),
    );
    await deleteStep("students", () =>
      tx.student.deleteMany({
        where: { personId: { notIn: [...keepIds] } },
      }),
    );
    await deleteStep("coaches", () =>
      tx.coach.deleteMany({
        where: { personId: { notIn: [...keepIds] } },
      }),
    );
    await deleteStep("zzp_coaches", () =>
      tx.zzpCoach.deleteMany({
        where: { personId: { notIn: [...keepIds] } },
      }),
    );
    await deleteStep("email_addresses", () =>
      tx.emailAddress.deleteMany({
        where: { personId: { notIn: [...keepIds] } },
      }),
    );
    await deleteStep("people", () =>
      tx.person.deleteMany({ where: { id: { notIn: [...keepIds] } } }),
    );
  });

  console.log("\nPhase 4 — Supabase auth.users");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping auth cleanup.",
    );
  } else {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const allAuthUsers: { id: string; email?: string }[] = [];
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      allAuthUsers.push(
        ...data.users.map((u) => ({ id: u.id, email: u.email ?? undefined })),
      );
      if (data.users.length < 1000) break;
      page += 1;
    }

    let deletedAuth = 0;
    for (const u of allAuthUsers) {
      if (keepIds.has(u.id)) continue;
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) {
        console.warn(`  failed ${u.email ?? u.id}: ${error.message}`);
      } else {
        deletedAuth += 1;
      }
    }
    console.log(`  auth.users deleted                 ${deletedAuth}`);
  }

  console.log("\n=== Summary ===");
  const counts = await Promise.all([
    prisma.person.count(),
    prisma.program.count(),
    prisma.season.count(),
    prisma.classSeries.count(),
    prisma.enrollment.count(),
    prisma.payment.count(),
    prisma.coach.count({ where: { personId: { not: SYSTEM_NO_COACH_PERSON_ID } } }),
  ]);
  console.log(`  people:        ${counts[0]} (expect 3: system + placeholder coach + admin)`);
  console.log(`  programs:      ${counts[1]}`);
  console.log(`  seasons:       ${counts[2]}`);
  console.log(`  class_series:  ${counts[3]}`);
  console.log(`  enrollments:   ${counts[4]}`);
  console.log(`  payments:      ${counts[5]}`);
  console.log(`  real coaches:  ${counts[6]}`);
  console.log("\nDone. Add programs, seasons, coaches, and classes from the admin UI.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
