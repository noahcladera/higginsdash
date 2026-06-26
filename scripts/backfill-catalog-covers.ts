/**
 * Assign curated stock photos to programs and class series that don't
 * have a cover image yet.
 *
 * Idempotent by default: only rows with `cover_image_url IS NULL` are
 * updated. Pass `--force` to replace existing covers too.
 *
 * Run:
 *   npm run db:backfill-catalog-covers
 *   npm run db:backfill-catalog-covers -- --confirm
 *   npm run db:backfill-catalog-covers -- --confirm --org higgins-nl
 */
import { PrismaClient } from "@prisma/client";

import { DEFAULT_COVER_IMAGE_FOCUS_Y } from "../src/lib/uploads/cover-image-focus";

const prisma = new PrismaClient();

function parseArgs() {
  const confirm = process.argv.includes("--confirm");
  const force = process.argv.includes("--force");
  const orgIdx = process.argv.indexOf("--org");
  const orgSlug =
    orgIdx >= 0 && process.argv[orgIdx + 1]
      ? process.argv[orgIdx + 1]
      : "higgins-nl";
  return { confirm, force, orgSlug };
}

function pickStock(
  stock: Array<{ url: string; title: string }>,
  index: number,
): { url: string; title: string } {
  return stock[index % stock.length]!;
}

async function main() {
  const { confirm, force, orgSlug } = parseArgs();

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { slug: true },
  });
  if (!org) {
    throw new Error(`Organization not found: ${orgSlug}`);
  }

  const stock = await prisma.stockMedia.findMany({
    where: { orgSlug },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: { url: true, title: true },
  });

  if (stock.length === 0) {
    throw new Error(
      `No stock media for org=${orgSlug}. Run: npm run seed:stock-media -- --confirm`,
    );
  }

  const programs = await prisma.program.findMany({
    where: force ? {} : { coverImageUrl: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, coverImageUrl: true },
  });

  const series = await prisma.classSeries.findMany({
    where: {
      archivedAt: null,
      ...(force ? {} : { coverImageUrl: null }),
    },
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
    select: { id: true, name: true, coverImageUrl: true },
  });

  console.log(
    `${confirm ? "WRITING" : "DRY-RUN"} catalog cover backfill for org=${orgSlug}\n` +
      `  stock photos: ${stock.length}\n` +
      `  programs to update: ${programs.length}${force ? " (force)" : ""}\n` +
      `  class series to update: ${series.length}${force ? " (force)" : ""}`,
  );

  if (programs.length === 0 && series.length === 0) {
    console.log("\nNothing to do — all rows already have covers.");
    return;
  }

  for (let i = 0; i < programs.length; i++) {
    const program = programs[i]!;
    const photo = pickStock(stock, i);
    console.log(
      `  program ${program.slug}: ${photo.title}${program.coverImageUrl ? " (replace)" : ""}`,
    );
    if (confirm) {
      await prisma.program.update({
        where: { id: program.id },
        data: {
          coverImageUrl: photo.url,
          coverImageFocusY: DEFAULT_COVER_IMAGE_FOCUS_Y,
        },
      });
    }
  }

  for (let i = 0; i < series.length; i++) {
    const row = series[i]!;
    const photo = pickStock(stock, programs.length + i);
    console.log(
      `  series ${row.name.slice(0, 60)}: ${photo.title}${row.coverImageUrl ? " (replace)" : ""}`,
    );
    if (confirm) {
      await prisma.classSeries.update({
        where: { id: row.id },
        data: {
          coverImageUrl: photo.url,
          coverImageFocusY: DEFAULT_COVER_IMAGE_FOCUS_Y,
        },
      });
    }
  }

  console.log(
    `\nDone (${confirm ? "written" : "dry-run, nothing written"}):\n` +
      `  programs: ${programs.length}\n` +
      `  class series: ${series.length}`,
  );

  if (!confirm) {
    console.log("\nRe-run with --confirm to apply.");
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
