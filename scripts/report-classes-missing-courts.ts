/**
 * List class series at club venues (Triaz / Randwijck) missing a court assignment.
 *
 * Run: npx tsx scripts/report-classes-missing-courts.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.classSeries.findMany({
    where: {
      archivedAt: null,
      defaultCourtId: null,
      venue: { kind: "club" },
      status: { not: "cancelled" },
    },
    select: {
      id: true,
      name: true,
      status: true,
      deliveryMode: true,
      venue: { select: { name: true } },
      program: { select: { name: true } },
    },
    orderBy: [{ venue: { name: "asc" } }, { name: "asc" }],
  });

  if (rows.length === 0) {
    console.log("All club-venue classes have a court assigned.");
    return;
  }

  console.log(`${rows.length} class series missing a court:\n`);
  for (const row of rows) {
    console.log(
      `- [${row.status}] ${row.name} (${row.program.name}) @ ${row.venue.name} — /admin/classes/${row.id}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
