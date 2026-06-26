/**
 * Spring 2026 demo population — single entry point.
 *
 * Wipes classes + CRM (keeps admin), rebuilds seasons, coaches, catalog,
 * demo personas, and synthetic enrollments from the NL office calendar.
 *
 * Usage:
 *   CONFIRM=yes npm run db:seed-spring-demo
 *
 * Pre-req: npm run db:seed (programs, venues, schools, clubs)
 */

import { PrismaClient } from "@prisma/client";
import {
  assertAdminExists,
  wipeAllClasses,
  wipeAllCrm,
  wipeAllSeasons,
} from "./lib/demo-wipe";
import { seedSeasons, seedSpringFromCalendar } from "./seed-spring-from-calendar";
import { seedDemoPersonas } from "./seed-demo-personas";
import { backfillClassCourts } from "./backfill-class-courts";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run spring demo seed in production.");
  }

  if (process.env.CONFIRM !== "yes") {
    console.error(
      "Refusing to run. This wipes classes and all non-admin users.\n" +
        "  Re-run with: CONFIRM=yes npm run db:seed-spring-demo",
    );
    process.exit(1);
  }

  console.log("=== Spring 2026 demo seed ===\n");

  await assertAdminExists(prisma);

  console.log("Step 1/7 — wipe classes");
  await wipeAllClasses(prisma);
  console.log("  done\n");

  console.log("Step 2/7 — wipe CRM (keeping admin + system)");
  await wipeAllCrm(prisma);
  console.log("  done\n");

  console.log("Step 3/7 — wipe seasons");
  const seasonsDeleted = await wipeAllSeasons(prisma);
  console.log(`  deleted ${seasonsDeleted} seasons\n`);

  console.log("Step 4/7 — seed seasons + spring catalog from calendar");
  await seedSeasons();
  const catalog = await seedSpringFromCalendar();
  console.log(
    `  ${catalog.total} series (${catalog.created} new, ${catalog.updated} updated), ${catalog.sessions.total} sessions (${catalog.sessions.past} past, ${catalog.sessions.upcoming} upcoming)\n`,
  );

  console.log("Step 5/7 — seed demo personas");
  await seedDemoPersonas();
  console.log("  done\n");

  console.log("Step 6/7 — populate synthetic enrollments");
  await populateDemoEnrollments();
  console.log("  done\n");

  console.log("Step 7/7 — assign courts to club-venue classes");
  const courtResult = await backfillClassCourts(prisma, { confirm: true });
  console.log(
    `  ${courtResult.assigned} assigned, ${courtResult.skipped} skipped${courtResult.warnings.length > 0 ? `, ${courtResult.warnings.length} warnings` : ""}\n`,
  );

  const counts = {
    seasons: await prisma.season.count(),
    classSeries: await prisma.classSeries.count(),
    groups: await prisma.classSeriesGroup.count(),
    sessions: await prisma.classSession.count(),
    coaches: await prisma.coach.count(),
    people: await prisma.person.count(),
    students: await prisma.student.count(),
    enrollments: await prisma.enrollment.count(),
    households: await prisma.household.count(),
  };

  console.log("=== Summary ===");
  console.table(counts);

  console.log("\nDemo login (password: higgins-test):");
  console.log("  student.demo@higginstennisnl.test       — adult student");
  console.log("  parent.demo@higginstennisnl.test        — parent + 1 child");
  console.log("  parent.multi.demo@higginstennisnl.test  — parent + 3 kids");
  console.log("  parent.plays.demo@higginstennisnl.test  — parent who also plays");
  console.log("\nSpring 2026 demo seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
