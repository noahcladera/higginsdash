/**
 * Programs-mode demo seed.
 *
 * Stands up a clean "lean" tenant from scratch without any club-only
 * rows (no Club, no Court, no Membership, no RecurringBlock, no
 * BookingSettings, no Ladder). Exercises the generic CRM + class
 * enrollment + coach scheduling path a programs-mode partner
 * (afterschool, music school, dance studio, AICS / IFS / BSA) would
 * actually use.
 *
 * What this creates:
 *
 *   - The synthetic System person + placeholder coach (via `seed-core`).
 *   - One `School` ("Demo International School").
 *   - One `Venue` of kind `school` linked to that school.
 *   - One `Program` ("Afterschool Tennis").
 *   - One demo `Household` + one parent + two kids.
 *
 * Idempotent: every row upserts on a stable slug / id. Safe to rerun.
 *
 * Run: `npm run db:seed-programs-demo`
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seedCore, seedOrganization } from "./seed-core";

const prisma = new PrismaClient();

const DEMO_SCHOOL_SLUG = "demo-international-school";
const DEMO_VENUE_SLUG = "demo-international-school-venue";
const DEMO_PROGRAM_SLUG = "afterschool-tennis";
const DEMO_HOUSEHOLD_ID = "00000000-0000-0000-0000-0000deadbeef";
const DEMO_PARENT_ID = "00000000-0000-0000-0000-00001111c0de";
const DEMO_KID_1_ID = "00000000-0000-0000-0000-00002222c0de";
const DEMO_KID_2_ID = "00000000-0000-0000-0000-00003333c0de";

async function seedDemoSchool(): Promise<{ schoolId: string; venueId: string }> {
  const school = await prisma.school.upsert({
    where: { slug: DEMO_SCHOOL_SLUG },
    create: {
      slug: DEMO_SCHOOL_SLUG,
      name: "Demo International School",
      notes: "Programs-mode demo — remove when onboarding a real tenant.",
    },
    update: {},
  });

  const venue = await prisma.venue.upsert({
    where: { slug: DEMO_VENUE_SLUG },
    create: {
      slug: DEMO_VENUE_SLUG,
      name: "Demo International School (gym)",
      kind: "school",
      addressLine1: "Demo Street 1",
      city: "Amsterdam",
      notes:
        "Programs-mode demo venue. The school's own gym — kids don't move; the coach comes to them.",
    },
    update: { isActive: true },
  });

  return { schoolId: school.id, venueId: venue.id };
}

async function seedDemoProgram(): Promise<string> {
  const program = await prisma.program.upsert({
    where: { slug: DEMO_PROGRAM_SLUG },
    create: {
      slug: DEMO_PROGRAM_SLUG,
      name: "Afterschool Tennis",
      targetAudience: "kids",
      defaultClassType: "school_onsite",
      descriptionPublic:
        "Weekly afterschool tennis at Demo International School. Racquets and balls provided. Parents drop off at school pickup — we take it from there.",
      descriptionInternal:
        "Programs-mode demo program. 8-week terms. Four kids per coach. Delivered onsite in the school gym.",
      displayOrder: 1,
    },
    update: { isActive: true },
  });
  return program.id;
}

async function seedDemoHousehold(): Promise<void> {
  await prisma.person.upsert({
    where: { id: DEMO_PARENT_ID },
    create: {
      id: DEMO_PARENT_ID,
      firstName: "Demo",
      lastName: "Parent",
      notes: "Programs-mode demo parent. Safe to delete.",
    },
    update: {},
  });

  await prisma.person.upsert({
    where: { id: DEMO_KID_1_ID },
    create: {
      id: DEMO_KID_1_ID,
      firstName: "Demo",
      lastName: "Kid One",
      dateOfBirth: new Date("2016-05-12"),
      notes: "Programs-mode demo kid #1. Safe to delete.",
    },
    update: {},
  });

  await prisma.person.upsert({
    where: { id: DEMO_KID_2_ID },
    create: {
      id: DEMO_KID_2_ID,
      firstName: "Demo",
      lastName: "Kid Two",
      dateOfBirth: new Date("2018-09-03"),
      notes: "Programs-mode demo kid #2. Safe to delete.",
    },
    update: {},
  });

  await prisma.household.upsert({
    where: { id: DEMO_HOUSEHOLD_ID },
    create: {
      id: DEMO_HOUSEHOLD_ID,
      displayName: "Demo household",
      primaryContactPersonId: DEMO_PARENT_ID,
      parentAlsoPlays: false,
      notes: "Programs-mode demo household. Safe to delete.",
    },
    update: {},
  });

  // Household members — each person belongs to at most one household,
  // so these upserts key on `personId`.
  await prisma.householdMember.upsert({
    where: { personId: DEMO_PARENT_ID },
    create: {
      householdId: DEMO_HOUSEHOLD_ID,
      personId: DEMO_PARENT_ID,
      roleInHousehold: "adult",
    },
    update: { householdId: DEMO_HOUSEHOLD_ID },
  });

  for (const kidId of [DEMO_KID_1_ID, DEMO_KID_2_ID]) {
    await prisma.householdMember.upsert({
      where: { personId: kidId },
      create: {
        householdId: DEMO_HOUSEHOLD_ID,
        personId: kidId,
        roleInHousehold: "child",
      },
      update: { householdId: DEMO_HOUSEHOLD_ID },
    });
  }
}

async function main(): Promise<void> {
  console.log("→ programs-demo seed starting…");

  await seedCore(prisma);
  console.log("Seeding demo-programs organization (after_school preset)…");
  await seedOrganization(prisma, {
    slug: "demo-programs",
    displayName: "Demo Programs Org",
    shortName: "Demo",
    country: "NL",
    locale: "en-US",
    currency: "EUR",
    presetSlug: "after_school",
    brandTitle: "Demo",
    brandSubline: "Programs",
  });
  const { schoolId, venueId } = await seedDemoSchool();
  const programId = await seedDemoProgram();
  await seedDemoHousehold();

  console.log(
    `✓ programs-demo seed ready (school=${schoolId} venue=${venueId} program=${programId})`,
  );
  console.log(
    "   Next: visit /admin/settings, switch product mode to Programs, and click around.",
  );
  // `randomUUID` is imported for future extensions (extra enrollments);
  // silence the unused-import warning.
  void randomUUID;
}

main()
  .catch((err) => {
    console.error("✗ programs-demo seed failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
