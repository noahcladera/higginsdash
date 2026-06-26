/**
 * Sync medal_level_content from curriculum module (idempotent upsert).
 * Run: npx tsx scripts/sync-medal-curriculum.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  curriculumLongDescription,
  MEDAL_CURRICULUM,
} from "../src/lib/medals/curriculum/checkpoints";

const prisma = new PrismaClient();

async function main() {
  console.log("Syncing medal_level_content from curriculum…");
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
  console.log(`Updated ${MEDAL_CURRICULUM.length} medal level rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
