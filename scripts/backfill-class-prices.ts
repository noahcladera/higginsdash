/**
 * One-shot: backfill `pricePerSession` (and the matching pre-multiplied
 * `pricePerSeries`) on every existing `class_series` row that doesn't
 * already carry a price.
 *
 * Why this exists: the admin form only started exposing a price field
 * very recently. Every series created before that landed with both
 * columns null, which makes the parent portal render the "Contact the
 * office for pricing" copy and skip the demo Mollie checkout. Running
 * this once flips every existing series to EUR 35/session so the
 * checkout flow is testable end-to-end without hand-editing rows.
 *
 * Idempotent: rows that already have a `pricePerSession` are left
 * alone (idea: never overwrite an admin's deliberate price). Rows
 * without any sessions yet keep `pricePerSeries` null and log a
 * warning so the admin knows to (re)generate the schedule.
 *
 * Run: `npm run db:backfill-class-prices`
 *
 * Keep DEFAULT_PRICE_PER_SESSION_EUR in lockstep with the matching
 * constant in src/app/admin/classes/actions.ts.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_PRICE_PER_SESSION_EUR = 35;

async function main() {
  const series = await prisma.classSeries.findMany({
    select: {
      id: true,
      name: true,
      pricePerSession: true,
      _count: {
        select: {
          // Cancelled sessions don't count toward billable lessons,
          // but Prisma's nested filter on `_count` only landed in v6;
          // we pre-fetch and filter in JS to keep the script portable
          // across local + CI environments.
          sessions: true,
        },
      },
      sessions: {
        where: { status: { not: "cancelled" } },
        select: { id: true },
      },
    },
  });

  let updated = 0;
  let skipped = 0;
  let warnedNoSessions = 0;

  for (const s of series) {
    if (s.pricePerSession != null) {
      skipped += 1;
      continue;
    }
    const sessionCount = s.sessions.length;
    const pricePerSeries =
      sessionCount > 0
        ? DEFAULT_PRICE_PER_SESSION_EUR * sessionCount
        : null;

    await prisma.classSeries.update({
      where: { id: s.id },
      data: {
        pricePerSession: DEFAULT_PRICE_PER_SESSION_EUR,
        pricePerSeries,
      },
    });
    updated += 1;
    if (sessionCount === 0) {
      warnedNoSessions += 1;
      console.warn(
        `\u26a0  ${s.name} (${s.id}): set EUR ${DEFAULT_PRICE_PER_SESSION_EUR}/session but no sessions exist yet — pricePerSeries left null. Regenerate the schedule before members will see a total.`,
      );
    }
  }

  console.log(
    `Backfilled ${updated} series at EUR ${DEFAULT_PRICE_PER_SESSION_EUR}/session, skipped ${skipped} (already priced), warned ${warnedNoSessions} (no sessions yet).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
