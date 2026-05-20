import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const r = await p.$queryRaw<
      {
        during_col: number;
        overlap_constraint: number;
        primary_email_idx: number;
        payment_lines_constraint: number;
        court_club_trigger: number;
        rb_club_trigger: number;
      }[]
    >`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.columns
          WHERE table_name = 'court_bookings' AND column_name = 'during') AS during_col,
        (SELECT COUNT(*)::int FROM pg_constraint
          WHERE conname = 'court_bookings_no_overlap') AS overlap_constraint,
        (SELECT COUNT(*)::int FROM pg_indexes
          WHERE indexname = 'email_addresses_one_primary_per_person') AS primary_email_idx,
        (SELECT COUNT(*)::int FROM pg_constraint
          WHERE conname = 'payment_lines_exactly_one_target') AS payment_lines_constraint,
        (SELECT COUNT(*)::int FROM pg_trigger
          WHERE tgname = 'court_bookings_club_matches_court_trigger') AS court_club_trigger,
        (SELECT COUNT(*)::int FROM pg_trigger
          WHERE tgname = 'recurring_blocks_club_matches_court_trigger') AS rb_club_trigger
    `;
    console.table(r);
    const all = Object.values(r[0]).every((v) => v === 1);
    console.log(all ? "All postgres_extras objects present." : "MISSING objects above.");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
