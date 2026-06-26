/**
 * Populate Spring 2 classes with synthetic enrollments.
 * Leaves 1–2 spots open per class; seeds waitlist on ~10% of full classes.
 *
 * Run: npm run db:populate-demo-enrollments
 */

import { PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";
import { SYSTEM_PERSON_ID } from "../src/lib/system-ids";
import { parseNlCalendar } from "./lib/parse-nl-calendar";

const prisma = new PrismaClient();
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    h = (h * 1103515245 + 12345) | 0;
    return ((h >>> 0) % 10000) / 10000;
  };
}

async function ensureSyntheticStudents(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const slug = `synthetic-student-${String(i + 1).padStart(3, "0")}`;
    const personId = uuidv5(`demo-synthetic:${slug}`, NS);
    const age = 5 + (i % 10);
    const dob = new Date(Date.UTC(2026 - age, 3, 15));

    await prisma.person.upsert({
      where: { id: personId },
      create: {
        id: personId,
        firstName: `Demo${i + 1}`,
        lastName: "Speler",
        dateOfBirth: dob,
        gender: i % 2 === 0 ? "male" : "female",
        country: "NL",
        notes: "Synthetic demo enrollment filler.",
      },
      update: {
        firstName: `Demo${i + 1}`,
        lastName: "Speler",
        dateOfBirth: dob,
      },
    });

    await prisma.student.upsert({
      where: { personId },
      create: {
        personId,
        enrollmentStatus: "active",
        skillLevel: age <= 6 ? "red_1" : age <= 9 ? "orange_2" : "green_2",
        joinedOn: new Date(),
      },
      update: { enrollmentStatus: "active" },
    });

    ids.push(personId);
  }
  return ids;
}

function targetFill(maxStudents: number, hint: number | null, rand: () => number): number {
  const leaveOpen = rand() < 0.5 ? 1 : 2;
  const cap = Math.max(0, maxStudents - leaveOpen);
  if (hint !== null && hint > 0) {
    return Math.min(cap, hint);
  }
  if (rand() < 0.05) {
    return Math.min(2, cap);
  }
  const ratio = 0.55 + rand() * 0.35;
  return Math.min(cap, Math.max(1, Math.round(maxStudents * ratio)));
}

export async function populateDemoEnrollments(): Promise<void> {
  const specs = parseNlCalendar();
  const hintByName = new Map(specs.map((s) => [s.name, s.enrolledCountHint]));

  const spring2Series = await prisma.classSeries.findMany({
    where: {
      archivedAt: null,
      season: { slug: { in: ["spring-2-2026-youth", "spring-2-2026-adult"] } },
    },
    select: {
      id: true,
      name: true,
      maxStudents: true,
      groups: {
        where: { archivedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  const syntheticIds = await ensureSyntheticStudents(120);
  let synthIdx = 0;
  let activeCount = 0;
  let waitlistCount = 0;

  for (const series of spring2Series) {
    const groupId = series.groups[0]?.id;
    if (!groupId) {
      console.warn(`  ! no group for ${series.name} — skipping enrollments`);
      continue;
    }

    const rand = seededRandom(series.id);
    const hint = hintByName.get(series.name) ?? null;
    const target = targetFill(series.maxStudents, hint, rand);
    const fillActive = Math.min(target, series.maxStudents);

    for (let i = 0; i < fillActive; i++) {
      const studentId = syntheticIds[synthIdx % syntheticIds.length];
      synthIdx++;

      await prisma.enrollment.upsert({
        where: {
          classSeriesId_studentPersonId: {
            classSeriesId: series.id,
            studentPersonId: studentId,
          },
        },
        create: {
          classSeriesId: series.id,
          groupId,
          studentPersonId: studentId,
          status: "active",
          enrolledByPersonId: SYSTEM_PERSON_ID,
          pricePaid: null,
        },
        update: {
          status: "active",
          groupId,
          withdrawnOn: null,
        },
      });
      activeCount++;
    }

    // Waitlist on ~10% when class would be full
    if (fillActive >= series.maxStudents - 1 && rand() < 0.1) {
      for (let w = 0; w < 2; w++) {
        const studentId = syntheticIds[synthIdx % syntheticIds.length];
        synthIdx++;
        await prisma.enrollment.upsert({
          where: {
            classSeriesId_studentPersonId: {
              classSeriesId: series.id,
              studentPersonId: studentId,
            },
          },
          create: {
            classSeriesId: series.id,
            groupId,
            studentPersonId: studentId,
            status: "waitlist",
            enrolledByPersonId: SYSTEM_PERSON_ID,
          },
          update: { status: "waitlist", groupId },
        });
        waitlistCount++;
      }
    }
  }

  // Demo persona enrollments — representative classes only
  await enrollDemoPersona("bobby-jansen-demo", "parent.demo@higginstennisnl.test", [
    "Spring 2 AICS Pickup Ages 7-9 Wed Triaz 2026",
    "Spring 2 Ages 7-13 Fri 4:00-5:30PM Triaz 2026",
  ]);
  await enrollDemoPersona("pip-smits-demo", "parent.plays.demo@higginstennisnl.test", [
    "Spring 2 BSA Pickup Ages 5-7 Mon Triaz 2026",
  ]);
  await enrollDemoPersona("noa-smits-demo", "parent.plays.demo@higginstennisnl.test", [
    "Spring 2 AICS Pickup Ages 7-9 Wed Triaz 2026",
  ]);
  await enrollDemoPersona(
    "student-demo",
    "student.demo@higginstennisnl.test",
    ["Spring 2 Wed 6:30-8:00PM Beginner to Intermediate Triaz 2026"],
    true,
  );
  await enrollDemoPersona(
    "parent-plays-demo",
    "parent.plays.demo@higginstennisnl.test",
    ["Spring 2 Fri 6:00-7:30PM Adult Learn & Play Randwijck 2026"],
    true,
  );

  console.log(`  ${activeCount} active synthetic enrollments`);
  console.log(`  ${waitlistCount} waitlist enrollments`);
}

async function personIdForEmail(email: string): Promise<string | null> {
  const row = await prisma.emailAddress.findFirst({
    where: { address: { equals: email, mode: "insensitive" } },
    select: { personId: true },
  });
  return row?.personId ?? null;
}

async function enrollDemoPersona(
  personSlug: string,
  guardianEmail: string,
  seriesNames: string[],
  selfEnroll = false,
): Promise<void> {
  const guardianPersonId = await personIdForEmail(guardianEmail);
  if (!guardianPersonId) {
    console.warn(`  ! guardian ${guardianEmail} not found — skipping ${personSlug}`);
    return;
  }

  const studentPersonId = selfEnroll
    ? guardianPersonId
    : uuidv5(`demo-person:${personSlug}`, NS);
  const enrolledBy = selfEnroll ? guardianPersonId : guardianPersonId;

  for (const name of seriesNames) {
    const series = await prisma.classSeries.findFirst({
      where: { name },
      select: {
        id: true,
        groups: { where: { archivedAt: null }, select: { id: true }, take: 1 },
      },
    });
    if (!series?.groups[0]) continue;

    await prisma.enrollment.upsert({
      where: {
        classSeriesId_studentPersonId: {
          classSeriesId: series.id,
          studentPersonId,
        },
      },
      create: {
        classSeriesId: series.id,
        groupId: series.groups[0].id,
        studentPersonId,
        status: "active",
        enrolledByPersonId: enrolledBy,
        pricePaid: null,
      },
      update: {
        status: "active",
        groupId: series.groups[0].id,
        enrolledByPersonId: enrolledBy,
      },
    });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to populate demo enrollments in production.");
  }

  console.log("=== Populating demo enrollments ===\n");
  await populateDemoEnrollments();
  console.log("\nDemo enrollment population complete.");
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("populate-demo-enrollments.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
