/**
 * Higgins Tennis NL catalog seed.
 *
 * This is the **club-mode, Higgins-specific** seed — 2 clubs, 5 venues,
 * 4 schools, 6 courts, 2 booking_settings, the launch program catalog,
 * and the korfball recurring blocks. Do not reuse for another tenant.
 *
 * The seed architecture is split so the lean "programs mode" packaging
 * can stand up a clean demo tenant without any club-only rows:
 *
 *   - `prisma/seed-core.ts`          — shared helpers (System person +
 *                                      placeholder "NO COACH YET" coach).
 *                                      Tenant-agnostic. Used by both
 *                                      seeds below.
 *   - `prisma/seed.ts` (this file)   — Higgins catalog on top of core.
 *   - `prisma/seed-programs-demo.ts` — minimal programs-mode demo tenant
 *                                      (one school + one program + one
 *                                      demo household). `npm run
 *                                      db:seed-programs-demo`.
 *
 * Real CRM data (kids, adults, coaches, households) lives under `context/`
 * and is loaded by a separate, future "data migration" plan — not here.
 *
 * Idempotent: safe to run multiple times. Uses slug / club+name as natural
 * keys for upsert so re-running just no-ops.
 *
 * Run: `npm run db:seed`
 */

import { PrismaClient } from "@prisma/client";
import { SYSTEM_PERSON_ID } from "../src/lib/system-ids";
import { ADULT_LEVELS, KIDS_LEVELS } from "../src/lib/skill-levels";
import {
  curriculumLongDescription,
  MEDAL_CURRICULUM,
} from "../src/lib/medals/curriculum/checkpoints";
import { seedCore, seedOrganization } from "./seed-core";

const prisma = new PrismaClient();

async function seedClubs() {
  const triaz = await prisma.club.upsert({
    where: { slug: "triaz" },
    create: {
      name: "S.V. Triaz",
      slug: "triaz",
      ownershipType: "leased",
      addressLine1: "Van Heenvlietlaan 6",
      postalCode: "1083 CL",
      city: "Amsterdam",
      country: "NL",
      latitude: 52.330343,
      longitude: 4.882560,
      displayOrder: 1,
      notes:
        "Paid-up multi-year lease. Shared evening use with original Triaz korfball club (Tue + Wed evenings — modeled as recurring_blocks).",
    },
    update: {
      name: "S.V. Triaz",
      addressLine1: "Van Heenvlietlaan 6",
      postalCode: "1083 CL",
      city: "Amsterdam",
      latitude: 52.330343,
      longitude: 4.882560,
      displayOrder: 1,
    },
  });

  const randwijck = await prisma.club.upsert({
    where: { slug: "randwijck" },
    create: {
      name: "Tennispark Randwijck",
      slug: "randwijck",
      ownershipType: "leased",
      addressLine1: "Barend van Dorenweerdelaan 16",
      postalCode: "1181 BK",
      city: "Amstelveen",
      country: "NL",
      latitude: 52.3125,
      longitude: 4.865,
      displayOrder: 2,
      notes:
        "Paid-up. HTN acts as operator. Land owned by Sjoerd Robijn who also maintains the courts daily — quality is exceptional. Strategic priority: fill the courts.",
    },
    update: {
      name: "Tennispark Randwijck",
      addressLine1: "Barend van Dorenweerdelaan 16",
      postalCode: "1181 BK",
      city: "Amstelveen",
      latitude: 52.3125,
      longitude: 4.865,
      displayOrder: 2,
    },
  });

  return { triaz, randwijck };
}

/**
 * Upsert the 5 class venues. The migration seeds them once, but we also
 * reconcile them on every run so `npm run db:seed` can be used after a
 * fresh reset.
 *
 *   - `triaz` / `randwijck` are `club` venues linked to their club rows.
 *   - `aics` is a `school` venue (we deliver on-site lessons here).
 *   - `aj-ernststraat` / `vu-sportcentrum` are `rented_court` backup
 *     venues — seeded but kept `isActive=false` until we need them.
 */
async function seedVenues(clubs: {
  triaz: { id: string };
  randwijck: { id: string };
}) {
  await prisma.venue.upsert({
    where: { slug: "triaz" },
    create: {
      slug: "triaz",
      name: "S.V. Triaz",
      kind: "club",
      addressLine1: "Van Heenvlietlaan 6",
      postalCode: "1083 CL",
      city: "Amsterdam",
      mapUrl:
        "https://maps.google.com/?q=S.V.+Triaz+Van+Heenvlietlaan+6+Amsterdam",
      clubId: clubs.triaz.id,
    },
    update: {
      name: "S.V. Triaz",
      addressLine1: "Van Heenvlietlaan 6",
      postalCode: "1083 CL",
      city: "Amsterdam",
      mapUrl:
        "https://maps.google.com/?q=S.V.+Triaz+Van+Heenvlietlaan+6+Amsterdam",
      clubId: clubs.triaz.id,
      kind: "club",
      isActive: true,
    },
  });

  await prisma.venue.upsert({
    where: { slug: "randwijck" },
    create: {
      slug: "randwijck",
      name: "Tennispark Randwijck",
      kind: "club",
      addressLine1: "Barend van Dorenweerdelaan 16",
      postalCode: "1181 BK",
      city: "Amstelveen",
      mapUrl:
        "https://maps.google.com/?q=Tennispark+Randwijck+Barend+van+Dorenweerdelaan+16+Amstelveen",
      clubId: clubs.randwijck.id,
    },
    update: {
      name: "Tennispark Randwijck",
      addressLine1: "Barend van Dorenweerdelaan 16",
      postalCode: "1181 BK",
      city: "Amstelveen",
      mapUrl:
        "https://maps.google.com/?q=Tennispark+Randwijck+Barend+van+Dorenweerdelaan+16+Amstelveen",
      clubId: clubs.randwijck.id,
      kind: "club",
      isActive: true,
    },
  });

  await prisma.venue.upsert({
    where: { slug: "aics" },
    create: {
      slug: "aics",
      name: "AICS",
      kind: "school",
      addressLine1: "Jacob Marislaan 27",
      postalCode: "1058 JC",
      city: "Amsterdam",
      notes:
        "Amsterdam International Community School. On-site lessons happen here. Also listed as a pickup school.",
    },
    update: { isActive: true },
  });

  await prisma.venue.upsert({
    where: { slug: "aj-ernststraat" },
    create: {
      slug: "aj-ernststraat",
      name: "A.J. Ernststraat",
      kind: "rented_court",
      addressLine1: "A.J. Ernststraat",
      city: "Amsterdam",
      notes: "Rented indoor court. Backup for rain/winter — archived by default.",
      isActive: false,
    },
    update: { isActive: false },
  });

  await prisma.venue.upsert({
    where: { slug: "vu-sportcentrum" },
    create: {
      slug: "vu-sportcentrum",
      name: "VU Sportcentrum",
      kind: "rented_court",
      addressLine1: "De Boelelaan 1109",
      postalCode: "1081 HV",
      city: "Amsterdam",
      notes:
        "Rented court at Vrije Universiteit Sportcentrum. Backup venue — archived by default.",
      isActive: false,
    },
    update: { isActive: false },
  });
}

/**
 * Upsert the 4 pickup schools. `coachArriveAtHubMinutes` = minutes before
 * `pickupAt` that the coach must already be at Triaz to grab the
 * gocab/stint.
 *
 *   - IFS   → 20 min
 *   - AICS  → 15 min   (also exists as a venue — see seedVenues)
 *   - BSA   → 30 min
 *   - AMITY → 30 min
 */
async function seedSchools() {
  const rows = [
    {
      slug: "ifs",
      name: "IFS",
      coachArriveAtHubMinutes: 20,
      notes:
        "International French School of Amsterdam. Coach at Triaz 20 min before pickup to grab the gocab.",
    },
    {
      slug: "aics",
      name: "AICS",
      coachArriveAtHubMinutes: 15,
      notes:
        "Amsterdam International Community School. Also exists as a venue for on-site lessons.",
    },
    {
      slug: "bsa",
      name: "BSA",
      coachArriveAtHubMinutes: 30,
      notes: "British School of Amsterdam. Coach at Triaz 30 min before pickup.",
    },
    {
      slug: "amity",
      name: "AMITY",
      coachArriveAtHubMinutes: 30,
      notes: "Amity International School. Coach at Triaz 30 min before pickup.",
    },
    {
      slug: "kindercampus",
      name: "Kindercampus Zuidas",
      coachArriveAtHubMinutes: 30,
      notes:
        "Kindercampus Zuidas. Coach at Triaz 30 min before pickup. Slug intentionally just 'kindercampus' so it matches the value the signup form stores on Student.school.",
    },
  ];

  for (const row of rows) {
    await prisma.school.upsert({
      where: { slug: row.slug },
      create: row,
      update: {
        name: row.name,
        coachArriveAtHubMinutes: row.coachArriveAtHubMinutes,
        isActive: true,
      },
    });
  }
}

async function seedCourts(clubs: {
  triaz: { id: string };
  randwijck: { id: string };
}) {
  const courtsSpec = [
    {
      clubId: clubs.triaz.id,
      name: "Court 1",
      displayOrder: 1,
      surface: "multi_use" as const,
      qualityTier: "walk_on_only" as const,
      isKnltbCertified: false,
      isBookable: false,
      notes: '"Walk on only" per SuperSaaS — never reservable',
    },
    {
      clubId: clubs.triaz.id,
      name: "Court 2",
      displayOrder: 2,
      surface: "multi_use" as const,
      qualityTier: "practice_only" as const,
      isKnltbCertified: false,
      isBookable: true,
      notes: "Recently resurfaced, low quality",
    },
    {
      clubId: clubs.triaz.id,
      name: "Court 3",
      displayOrder: 3,
      surface: "grass" as const,
      qualityTier: "premium" as const,
      isKnltbCertified: true,
      isBookable: true,
      notes: "KNLTB-certified",
    },
    {
      clubId: clubs.triaz.id,
      name: "Court 4",
      displayOrder: 4,
      surface: "grass" as const,
      qualityTier: "premium" as const,
      isKnltbCertified: true,
      isBookable: true,
      notes: "KNLTB-certified",
    },
    {
      clubId: clubs.randwijck.id,
      name: "B. Borg",
      displayOrder: 1,
      surface: "clay" as const,
      qualityTier: "premium" as const,
      isKnltbCertified: true,
      isBookable: true,
      notes: "Maintained daily by Sjoerd Robijn — exceptional condition",
    },
    {
      clubId: clubs.randwijck.id,
      name: "J. Mcenroe",
      displayOrder: 2,
      surface: "clay" as const,
      qualityTier: "premium" as const,
      isKnltbCertified: true,
      isBookable: true,
      notes: "Maintained daily by Sjoerd Robijn — exceptional condition",
    },
  ];

  const created = [];
  for (const spec of courtsSpec) {
    const court = await prisma.court.upsert({
      where: { clubId_name: { clubId: spec.clubId, name: spec.name } },
      create: spec,
      update: {},
    });
    created.push(court);
  }
  return created;
}

async function seedBookingSettings(clubs: {
  triaz: { id: string };
  randwijck: { id: string };
}) {
  // Triaz: free, 1/day, 09:00–22:00, 10-min cancel cutoff, member_decides
  await prisma.bookingSettings.upsert({
    where: { clubId: clubs.triaz.id },
    create: {
      clubId: clubs.triaz.id,
      bookingDurationMinutes: 60,
      startTimeConstraint: "on_the_half_hour",
      opensAtLocalTime: new Date("1970-01-01T09:00:00Z"),
      closesAtLocalTime: new Date("1970-01-01T22:00:00Z"),
      earliestBookingOffsetMinutes: 10,
      latestBookingOffsetDays: 7,
      maxBookingsPerMemberPerDay: 1,
      cancellationOffsetMinutes: 10,
      partnerCaptureMode: "fk_member",
      minPartners: 0,
      maxPartners: 3,
      allowsMemberRecurringBlocks: false,
      requiresPayment: false,
      defaultPricePerHour: null,
      confirmationMode: "member_decides",
      dailyOverviewEmail: null,
      reminderOffsetMinutes: 60,
    },
    update: { startTimeConstraint: "on_the_half_hour" },
  });

  // Randwijck: paid, 2/day, 09:00–22:00, 2-day cancel cutoff, auto_email
  await prisma.bookingSettings.upsert({
    where: { clubId: clubs.randwijck.id },
    create: {
      clubId: clubs.randwijck.id,
      bookingDurationMinutes: 60,
      startTimeConstraint: "on_the_half_hour",
      opensAtLocalTime: new Date("1970-01-01T09:00:00Z"),
      closesAtLocalTime: new Date("1970-01-01T22:00:00Z"),
      earliestBookingOffsetMinutes: 10,
      latestBookingOffsetDays: 7,
      maxBookingsPerMemberPerDay: 2,
      cancellationOffsetMinutes: 60 * 24 * 2, // 2 days
      partnerCaptureMode: "free_text",
      minPartners: 1,
      maxPartners: 3,
      allowsMemberRecurringBlocks: true,
      requiresPayment: true,
      defaultPricePerHour: null, // real price grid TBD — see §2.13.3 note
      confirmationMode: "auto_email",
      dailyOverviewEmail: "higginstennisnloffice@gmail.com",
      reminderOffsetMinutes: 60,
    },
    update: {
      startTimeConstraint: "on_the_half_hour",
      opensAtLocalTime: new Date("1970-01-01T09:00:00Z"),
    },
  });
}

async function seedPrograms() {
  // Public description + cover image for each program is what the
  // /portal/programs catalog shows on each card. The strings below are
  // placeholder copy ("STUB" prefix) — the real Tier-1 inputs the
  // gotimmy-substitute plan asks for go in here once they land. Updating
  // the description on an already-seeded program is intentionally a
  // no-op so admin edits via the UI aren't clobbered by a re-seed.
  const programsSpec = [
    {
      slug: "kids-group",
      name: "Kids Group Lessons",
      targetAudience: "kids" as const,
      defaultClassType: "group_lesson" as const,
      displayOrder: 10,
      descriptionPublic:
        "Weekly group lessons for kids ages 4–16. Small groups, friendly coaches, and the same court every week so progress sticks.",
      coverImageUrl: null,
    },
    {
      slug: "adult-group",
      name: "Adult Lessons",
      targetAudience: "adults" as const,
      defaultClassType: "group_lesson" as const,
      displayOrder: 20,
      descriptionPublic:
        "Adult group sessions for every level — from first-racket to club-team players. Show up, hit balls, leave smiling.",
      coverImageUrl: null,
    },
    {
      slug: "high-performance",
      name: "High Performance",
      targetAudience: "kids" as const,
      defaultClassType: "high_performance" as const,
      displayOrder: 30,
      descriptionPublic:
        "Performance track for committed juniors aged 8–14. Multiple sessions per week, technique focus, and competitive matchplay.",
      coverImageUrl: null,
    },
    {
      slug: "school-programs",
      name: "School Programs",
      targetAudience: "kids" as const,
      defaultClassType: "school_pickup" as const,
      displayOrder: 40,
      descriptionPublic:
        "Coach-led pickup from BSA, IFS, AICS and AMITY straight to court. We handle the gocab; you handle the rest of your day.",
      coverImageUrl: null,
    },
    {
      slug: "camps",
      name: "Camps",
      targetAudience: "kids" as const,
      defaultClassType: "camp" as const,
      displayOrder: 50,
      descriptionPublic:
        "Half-day and full-day holiday camps. Tennis, games, lunch, repeat. Best way to spend a school break.",
      coverImageUrl: null,
    },
    {
      slug: "privates",
      name: "Privates",
      targetAudience: "mixed" as const,
      defaultClassType: "private_individual" as const,
      displayOrder: 60,
      descriptionPublic:
        "One-on-one or small-group private lessons matched to your goals. Email the office to set one up.",
      coverImageUrl: null,
    },
    {
      slug: "events",
      name: "Events",
      targetAudience: "mixed" as const,
      defaultClassType: "event" as const,
      displayOrder: 5,
      descriptionPublic:
        "One-off tournaments, socials, and clinics run by Higgins Tennis.",
      coverImageUrl: null,
    },
  ];

  for (const spec of programsSpec) {
    await prisma.program.upsert({
      where: { slug: spec.slug },
      // Only set descriptionPublic on first insert so admin edits via
      // the editor aren't reverted by a re-seed.
      create: spec,
      update: {
        // Refresh the immutable bits (audience, name, ordering) but
        // leave description + cover alone.
        name: spec.name,
        targetAudience: spec.targetAudience,
        defaultClassType: spec.defaultClassType,
        displayOrder: spec.displayOrder,
      },
    });
  }
}

async function seedKorfballBlocks(courts: { id: string; clubId: string; name: string }[]) {
  const triazCourt3 = courts.find(
    (c) => c.name === "Court 3" && c.clubId === courts[0].clubId
  );
  const triazCourt4 = courts.find(
    (c) => c.name === "Court 4" && c.clubId === courts[0].clubId
  );

  if (!triazCourt3 || !triazCourt4) {
    throw new Error("Could not find Triaz Court 3/4 for korfball seed");
  }

  // 4 blocks: Tue + Wed, courts 3 & 4, 18:00–22:00.
  // Idempotent via a deterministic compound (court+day+start_time+purpose).
  const blocksSpec = [
    { court: triazCourt3, dayOfWeek: "tue" as const },
    { court: triazCourt4, dayOfWeek: "tue" as const },
    { court: triazCourt3, dayOfWeek: "wed" as const },
    { court: triazCourt4, dayOfWeek: "wed" as const },
  ];

  const startTime = new Date("1970-01-01T18:00:00Z");
  const endTime = new Date("1970-01-01T22:00:00Z");
  const startsOn = new Date("2026-01-01");
  const endsOn = new Date("2027-12-31");

  for (const spec of blocksSpec) {
    const existing = await prisma.recurringBlock.findFirst({
      where: {
        courtId: spec.court.id,
        dayOfWeek: spec.dayOfWeek,
        purposeType: "external_partner",
        purposeDescription: "Korfball club shared use",
      },
    });
    if (existing) continue;

    await prisma.recurringBlock.create({
      data: {
        courtId: spec.court.id,
        clubId: spec.court.clubId,
        requesterPersonId: SYSTEM_PERSON_ID,
        requesterHouseholdId: null,
        purposeType: "external_partner",
        // Heather feedback v1: split-use with KV Triaz korfball — the
        // courts are reserved for korfball *teams*, but our coaches
        // still need to give private lessons on courts 3-4 during
        // that window. Use a clearer label and `members_only` scope so
        // members are blocked from booking but coaches can continue.
        purposeDescription: "KV Triaz — korfball training (split use)",
        scope: "members_only",
        dayOfWeek: spec.dayOfWeek,
        startTime,
        endTime,
        startsOn,
        endsOn,
        status: "active",
        invoiceStatus: "waived",
        activatedAt: new Date(),
      },
    });
  }
}

/**
 * One CMS row per skill level for "What's my level?" pages. Idempotent.
 */
async function seedMedalLevelContent() {
  for (const [i, level] of MEDAL_CURRICULUM.entries()) {
    await prisma.medalLevelContent.upsert({
      where: { medalLevel: level.medalLevel },
      create: {
        medalLevel: level.medalLevel,
        title: level.title,
        shortDescription: `Ages ${level.typicalAge}`,
        longDescription: curriculumLongDescription(level),
        howToGraduate: level.graduateTo,
        sortOrder: i,
      },
      update: {
        title: level.title,
        shortDescription: `Ages ${level.typicalAge}`,
        longDescription: curriculumLongDescription(level),
        howToGraduate: level.graduateTo,
        sortOrder: i,
      },
    });
  }
}

async function seedLevelContent() {
  await prisma.levelContent.createMany({
    data: KIDS_LEVELS.map((l, i) => ({
      skillLevel: l.value,
      audience: "kids" as const,
      title: l.label,
      longDescription: "",
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  await prisma.levelContent.createMany({
    data: ADULT_LEVELS.map((l, i) => ({
      skillLevel: l.value,
      audience: "adults" as const,
      title: l.label,
      longDescription: "",
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

async function main() {
  console.log("Seeding core anchor rows (system person + placeholder coach)…");
  await seedCore(prisma);

  console.log("Seeding higgins-nl organization (tennis_club preset)…");
  await seedOrganization(prisma, {
    slug: "higgins-nl",
    displayName: "Higgins Tennis Nederland",
    shortName: "Higgins",
    country: "NL",
    locale: "nl-NL",
    currency: "EUR",
    presetSlug: "tennis_club",
    brandTitle: "Higgins",
    brandSubline: "Tennis Nederland",
    officeEmail: "office@higginstennisnl.com",
  });

  console.log("Seeding level content (skill level descriptions)…");
  await seedLevelContent();

  console.log("Seeding medal level content (medals guide)…");
  await seedMedalLevelContent();

  console.log("Seeding clubs…");
  const clubs = await seedClubs();

  console.log("Seeding venues…");
  await seedVenues(clubs);

  console.log("Seeding schools…");
  await seedSchools();

  console.log("Seeding courts…");
  const courts = await seedCourts(clubs);

  console.log("Seeding booking_settings…");
  await seedBookingSettings(clubs);

  console.log("Seeding programs…");
  await seedPrograms();

  console.log("Seeding korfball recurring_blocks…");
  await seedKorfballBlocks(courts);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
