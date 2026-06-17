/**
 * Coach E2E smoke (data layer).
 *
 * Simulates the admin → coach critical path without Supabase auth:
 *   1. Provision a staff coach row (same shape as invite-time provisioning)
 *   2. Assign coach as lead on a real catalog series
 *   3. Ensure a student enrollment exists on that series
 *   4. Mark attendance on a session (roll call)
 *
 * Run: `npm run smoke:coach`
 *
 * Pre-reqs: `npm run db:seed` + `npm run db:seed-real-catalog`
 */

import assert from "node:assert/strict";
import { ClassCoachRole, CoachEmploymentType, PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";

const prisma = new PrismaClient();
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const COACH_ID = uuidv5("smoke:coach:e2e", NS);
const STUDENT_ID = uuidv5("smoke:coach:student", NS);

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function ensureCoach() {
  await prisma.person.upsert({
    where: { id: COACH_ID },
    create: {
      id: COACH_ID,
      firstName: "Smoke",
      lastName: "Coach",
      notes: "Coach E2E smoke fixture. Safe to delete.",
    },
    update: { firstName: "Smoke", lastName: "Coach" },
  });
  await prisma.coach.upsert({
    where: { personId: COACH_ID },
    create: {
      personId: COACH_ID,
      employmentType: CoachEmploymentType.employee,
      joinedOn: todayUtc(),
      isActive: true,
    },
    update: { isActive: true, archivedAt: null },
  });
}

async function pickPickupSeries() {
  const series = await prisma.classSeries.findFirst({
    where: {
      classType: "school_pickup",
      archivedAt: null,
      sessions: { some: { startsAt: { gte: new Date() } } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sessions: {
        where: { startsAt: { gte: new Date() }, cancelledAt: null },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { id: true, startsAt: true },
      },
    },
  });
  assert.ok(series, "No future school_pickup series — run db:seed-real-catalog");
  assert.ok(series.sessions[0], "Series has no future sessions");
  return { seriesId: series.id, seriesName: series.name, sessionId: series.sessions[0].id };
}

async function assignCoachLead(seriesId: string) {
  await prisma.classSeriesCoach.upsert({
    where: {
      classSeriesId_coachPersonId: {
        classSeriesId: seriesId,
        coachPersonId: COACH_ID,
      },
    },
    create: {
      classSeriesId: seriesId,
      coachPersonId: COACH_ID,
      role: ClassCoachRole.lead,
    },
    update: { role: ClassCoachRole.lead },
  });
}

async function ensureStudentEnrollment(seriesId: string) {
  await prisma.person.upsert({
    where: { id: STUDENT_ID },
    create: {
      id: STUDENT_ID,
      firstName: "Roll",
      lastName: "Call",
      dateOfBirth: new Date(Date.UTC(2016, 3, 15)),
    },
    update: {},
  });
  await prisma.student.upsert({
    where: { personId: STUDENT_ID },
    create: { personId: STUDENT_ID, school: "BSA" },
    update: {},
  });
  await prisma.enrollment.upsert({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId: seriesId,
        studentPersonId: STUDENT_ID,
      },
    },
    create: {
      classSeriesId: seriesId,
      studentPersonId: STUDENT_ID,
      enrolledByPersonId: COACH_ID,
      status: "active",
      enrolledOn: todayUtc(),
    },
    update: { status: "active" },
  });
}

async function markRollCall(sessionId: string, seriesId: string) {
  const attendance = await prisma.attendance.upsert({
    where: {
      classSessionId_studentPersonId: {
        classSessionId: sessionId,
        studentPersonId: STUDENT_ID,
      },
    },
    create: {
      classSessionId: sessionId,
      studentPersonId: STUDENT_ID,
      status: "present",
      recordedByPersonId: COACH_ID,
    },
    update: { status: "present", recordedByPersonId: COACH_ID },
    select: { id: true, status: true },
  });
  assert.equal(attendance.status, "present");

  const coachSeries = await prisma.classSeries.findMany({
    where: {
      archivedAt: null,
      coaches: { some: { coachPersonId: COACH_ID } },
    },
    select: { id: true },
  });
  assert.ok(
    coachSeries.some((s) => s.id === seriesId),
    "Coach should see assigned series",
  );
}

async function main() {
  console.log("[smoke:coach] provisioning coach fixture…");
  await ensureCoach();

  const { seriesId, seriesName, sessionId } = await pickPickupSeries();
  console.log(`[smoke:coach] using series "${seriesName}"`);

  await assignCoachLead(seriesId);
  console.log("[smoke:coach] assigned coach as lead");

  await ensureStudentEnrollment(seriesId);
  console.log("[smoke:coach] ensured student enrollment");

  await markRollCall(sessionId, seriesId);
  console.log("[smoke:coach] roll call marked present");

  console.log("\nPASS — coach assign → roster → attendance path OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
