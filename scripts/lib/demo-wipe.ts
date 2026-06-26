/**
 * Reusable wipe helpers for the spring demo orchestrator.
 * Keeps system rows + isAdmin users.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { SYSTEM_HOUSEHOLD_ID, SYSTEM_PERSON_ID } from "../../src/lib/system-ids";

export async function wipeAllClasses(prisma: PrismaClient): Promise<void> {
  const enrollmentIds = (
    await prisma.enrollment.findMany({ select: { id: true } })
  ).map((e) => e.id);

  if (enrollmentIds.length > 0) {
    await prisma.paymentLine.deleteMany({
      where: { enrollmentId: { in: enrollmentIds } },
    });
  }

  await prisma.enrollmentLevelReview.deleteMany({});
  await prisma.classTransferRequest.deleteMany({});
  await prisma.classUpdate.deleteMany({});
  await prisma.coachSubRequest.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.classSessionCoachGroup.deleteMany({});
  await prisma.classSessionCoach.deleteMany({});
  await prisma.classSession.deleteMany({});
  await prisma.classSeriesCoachGroup.deleteMany({});
  await prisma.classSeriesCoach.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.classSeriesGroup.deleteMany({});
  await prisma.classSeries.deleteMany({});
}

export async function wipeAllSeasons(prisma: PrismaClient): Promise<number> {
  const r = await prisma.season.deleteMany({});
  return r.count;
}

export async function wipeAllCrm(prisma: PrismaClient): Promise<void> {
  const keepPeople = await prisma.person.findMany({
    where: {
      OR: [{ id: SYSTEM_PERSON_ID }, { isAdmin: true }],
    },
    select: { id: true },
  });
  const keepIds = new Set(keepPeople.map((p) => p.id));

  await prisma.courtBookingPartner.deleteMany({});
  await prisma.courtBooking.deleteMany({});
  await prisma.recurringBlock.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.refund.deleteMany({});
  await prisma.paymentLine.deleteMany({});
  await prisma.paymentCheckoutIntent.deleteMany({});
  await prisma.householdCredit.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.trialInterest.deleteMany({});
  await prisma.calendarFeedToken.deleteMany({});
  await prisma.householdMember.deleteMany({});

  await prisma.household.updateMany({
    where: { id: { not: SYSTEM_HOUSEHOLD_ID } },
    data: { primaryContactPersonId: SYSTEM_PERSON_ID },
  });
  await prisma.household.deleteMany({
    where: { id: { not: SYSTEM_HOUSEHOLD_ID } },
  });

  await prisma.studentLevelProgress.deleteMany({});
  await prisma.studentSkillHistory.deleteMany({});
  await prisma.student.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  await prisma.coachAvailability.deleteMany({});
  await prisma.coach.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  await prisma.zzpCoach.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  await prisma.coachClubAccess.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  await prisma.coachInvite.deleteMany({});
  await prisma.emailAddress.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  await prisma.person.deleteMany({
    where: { id: { notIn: [...keepIds] } },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const allAuthUsers: { id: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    allAuthUsers.push(...data.users.map((u) => ({ id: u.id })));
    if (data.users.length < 1000) break;
    page += 1;
  }

  for (const u of allAuthUsers) {
    if (keepIds.has(u.id)) continue;
    await admin.auth.admin.deleteUser(u.id);
  }
}

export async function assertAdminExists(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.person.findFirst({
    where: { isAdmin: true, id: { not: SYSTEM_PERSON_ID } },
    select: { firstName: true, lastName: true },
  });
  if (!admin) {
    throw new Error(
      "No admin user found — log in once as admin before running spring demo seed.",
    );
  }
}
