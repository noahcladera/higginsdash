/**
 * Backfill org-scoped marketing images for club membership tiles.
 *
 * Picks the best Triaz / Randwijck photo from `stock_media` (same
 * heuristics as the runtime fallback in getMarketingImages) and upserts
 * `MarketingImage` rows so club tiles persist across deploys.
 *
 * Run stock import first:
 *   npm run seed:stock-media -- --confirm
 *   npm run seed:marketing-images -- --confirm
 */
import { PrismaClient } from "@prisma/client";

import { findClubStockPhotoUrl } from "../src/lib/uploads/club-stock-photos";
import { MARKETING_IMAGE_KEYS } from "../src/lib/uploads/marketing-images-keys";

const prisma = new PrismaClient();

const CLUB_KEYS = [
  { key: MARKETING_IMAGE_KEYS.clubTriaz, slug: "triaz" as const },
  { key: MARKETING_IMAGE_KEYS.clubRandwijck, slug: "randwijck" as const },
];

function parseArgs() {
  const confirm = process.argv.includes("--confirm");
  const orgIdx = process.argv.indexOf("--org");
  const orgSlug =
    orgIdx >= 0 && process.argv[orgIdx + 1]
      ? process.argv[orgIdx + 1]
      : "higgins-nl";
  return { confirm, orgSlug };
}

async function main() {
  const { confirm, orgSlug } = parseArgs();

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { slug: true },
  });
  if (!org) {
    throw new Error(`Organization not found: ${orgSlug}`);
  }

  const stockCount = await prisma.stockMedia.count({ where: { orgSlug } });
  if (stockCount === 0) {
    console.warn(
      `No stock media for org=${orgSlug}. Run: npm run seed:stock-media -- --confirm`,
    );
  }

  console.log(
    `${confirm ? "WRITING" : "DRY-RUN"} marketing images for org=${orgSlug}\n` +
      `  stock media rows: ${stockCount}`,
  );

  for (const { key, slug } of CLUB_KEYS) {
    const existing = await prisma.marketingImage.findUnique({
      where: { orgSlug_key: { orgSlug, key } },
      select: { url: true },
    });

    if (existing?.url) {
      console.log(`  [skip] ${key} — already set`);
      continue;
    }

    const url = await findClubStockPhotoUrl(orgSlug, slug);
    if (!url) {
      console.warn(`  [missing] ${key} — no matching stock photo`);
      continue;
    }

    console.log(`  [${confirm ? "upsert" : "would upsert"}] ${key}\n           ${url}`);

    if (confirm) {
      await prisma.marketingImage.upsert({
        where: { orgSlug_key: { orgSlug, key } },
        create: { orgSlug, key, url },
        update: { url },
      });
    }
  }

  if (!confirm) {
    console.log("\nRe-run with --confirm to write marketing_image rows.");
  } else {
    console.log("\nDone.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
