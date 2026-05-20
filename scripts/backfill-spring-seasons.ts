/**
 * One-shot: bulk-pin every active class series to the right Spring 2026
 * season so the user doesn't have to open the Schedule editor on each
 * one.
 *
 *   - Youth (program.targetAudience === "kids")   → "Spring 2026"
 *   - Adults (program.targetAudience === "adults") → "Spring 1 2026"
 *   - IFS classes are full-year and stay seasonless.
 *   - Mixed-audience rows are skipped (logged) so the operator can
 *     decide manually.
 *
 * Idempotent: rows already pointing at the correct season are no-ops.
 * Rows with a manual `name_override` keep their custom name verbatim
 * (matches the `nameForSeries` gate in
 * `src/app/admin/classes/actions.ts`); only `seasonId` flips for them.
 *
 * Does NOT touch `startsOn`, `endsOn`, `excluded_dates`, or
 * `class_sessions` — sessions are already generated, the user only
 * wants the season pointer set.
 *
 * Run: `npx tsx scripts/backfill-spring-seasons.ts`
 */

import { PrismaClient } from "@prisma/client";
import { deriveSeriesName } from "../src/lib/classes/series-name";
import type { SkillLevelValue } from "../src/lib/skill-levels";

const prisma = new PrismaClient();

const YOUTH_SEASON_NAME = "Spring 2026";
const ADULT_SEASON_NAME = "Spring 1 2026";
const IFS_SCHOOL_NAME = "IFS";

function dateToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function main() {
  const [springYouth, springAdult1] = await Promise.all([
    prisma.season.findFirst({
      where: { name: YOUTH_SEASON_NAME },
      select: { id: true, name: true },
    }),
    prisma.season.findFirst({
      where: { name: ADULT_SEASON_NAME },
      select: { id: true, name: true },
    }),
  ]);

  if (!springYouth) {
    throw new Error(
      `Season "${YOUTH_SEASON_NAME}" not found. Create it in the seasons admin first.`,
    );
  }
  if (!springAdult1) {
    throw new Error(
      `Season "${ADULT_SEASON_NAME}" not found. Create it in the seasons admin first.`,
    );
  }

  const series = await prisma.classSeries.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      name: true,
      nameOverride: true,
      seasonId: true,
      deliveryMode: true,
      dayOfWeek: true,
      startTime: true,
      startsOn: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      program: { select: { targetAudience: true } },
      venue: { select: { name: true } },
      school: { select: { name: true } },
      groups: {
        select: {
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
        },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  let updated = 0;
  let noop = 0;
  let skippedIfs = 0;
  let skippedMixed = 0;

  for (const s of series) {
    if (s.school?.name === IFS_SCHOOL_NAME) {
      skippedIfs++;
      console.log(`[skip] IFS — ${s.name}`);
      continue;
    }

    const audience = s.program.targetAudience;
    if (audience === "mixed") {
      skippedMixed++;
      console.log(`[skip] mixed audience — ${s.name}`);
      continue;
    }

    const target = audience === "adults" ? springAdult1 : springYouth;
    if (s.seasonId === target.id) {
      noop++;
      continue;
    }

    const override = (s.nameOverride ?? "").trim();
    const nextName = override
      ? s.name
      : deriveSeriesName({
          audience,
          deliveryMode: s.deliveryMode,
          venueName: s.venue?.name ?? null,
          schoolName: s.school?.name ?? null,
          dayOfWeek: s.dayOfWeek,
          startTimeHHMM: dateToHHMM(s.startTime),
          seasonName: target.name,
          startYear: s.startsOn ? s.startsOn.getUTCFullYear() : null,
          seriesMinAge: s.minAge,
          seriesMaxAge: s.maxAge,
          seriesEligibleSkillLevels:
            s.eligibleSkillLevels as SkillLevelValue[],
          groups: s.groups.map((g) => ({
            minAge: g.minAge,
            maxAge: g.maxAge,
            eligibleSkillLevels: g.eligibleSkillLevels as SkillLevelValue[],
          })),
        });

    await prisma.classSeries.update({
      where: { id: s.id },
      data: { seasonId: target.id, name: nextName },
    });
    updated++;
    console.log(`[ok] ${s.name}  ->  ${nextName}`);
  }

  console.log(
    `\nDone: ${updated} updated, ${skippedIfs} IFS skipped, ${skippedMixed} mixed skipped, ${noop} already correct.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
