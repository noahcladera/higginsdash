/**
 * One-off backfill: delete redundant single-tier memberships that sit
 * underneath a family membership covering a superset of the same clubs.
 *
 * Origin story: before we tightened the membership purchase rules, a
 * household could end up with both "Family - both clubs" and
 * "Adult - Randwijck only" active simultaneously. The smaller one is
 * fully shadowed by the bigger one and just confuses the UI.
 *
 * Defaults to a dry-run; pass `--apply` to actually delete.
 *
 *   npx dotenv -e .env.local -- tsx scripts/cleanup-overlapping-memberships.ts
 *   npx dotenv -e .env.local -- tsx scripts/cleanup-overlapping-memberships.ts --apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

interface OverlapRow {
  household: { id: string; displayName: string };
  keep: { id: string; label: string; clubs: string[] };
  drop: { id: string; label: string; clubs: string[] };
}

function clubLabel(clubs: string[]): string {
  if (clubs.length === 0) return "no-clubs";
  return [...clubs].sort().join("+");
}

function membershipLabel(m: {
  kind: string;
  coverageTier: string;
  membershipClubs: { club: { slug: string } }[];
}): string {
  const tier = m.coverageTier;
  const clubs = m.membershipClubs.map((mc) => mc.club.slug);
  return `${tier} (${clubLabel(clubs)})`;
}

async function main() {
  console.log(
    APPLY
      ? "Mode: APPLY — overlapping memberships will be deleted"
      : "Mode: DRY RUN — pass --apply to actually delete",
  );
  console.log();

  const households = await prisma.household.findMany({
    select: {
      id: true,
      displayName: true,
      memberships: {
        where: { status: "active" },
        select: {
          id: true,
          kind: true,
          coverageTier: true,
          startsOn: true,
          expiresOn: true,
          membershipClubs: {
            select: { club: { select: { slug: true } } },
          },
        },
      },
    },
  });

  const overlaps: OverlapRow[] = [];

  for (const h of households) {
    const family = h.memberships.find((m) => m.coverageTier === "family");
    if (!family) continue;
    const familyClubs = new Set(
      family.membershipClubs.map((mc) => mc.club.slug),
    );

    for (const other of h.memberships) {
      if (other.id === family.id) continue;
      const otherClubs = other.membershipClubs.map((mc) => mc.club.slug);
      // Redundant if the other membership covers no clubs the family
      // membership doesn't already cover.
      const isSubset =
        otherClubs.length > 0 && otherClubs.every((c) => familyClubs.has(c));
      if (!isSubset) continue;

      overlaps.push({
        household: { id: h.id, displayName: h.displayName },
        keep: {
          id: family.id,
          label: membershipLabel(family),
          clubs: [...familyClubs],
        },
        drop: {
          id: other.id,
          label: membershipLabel(other),
          clubs: otherClubs,
        },
      });
    }
  }

  if (overlaps.length === 0) {
    console.log("No overlapping memberships found. Nothing to do.");
    return;
  }

  console.log(`Found ${overlaps.length} redundant membership(s):`);
  console.log();
  for (const o of overlaps) {
    console.log(`  Household: ${o.household.displayName} (${o.household.id})`);
    console.log(`    KEEP: ${o.keep.label}  [${o.keep.id}]`);
    console.log(`    DROP: ${o.drop.label}  [${o.drop.id}]`);
    console.log();
  }

  if (!APPLY) {
    console.log(
      "Re-run with --apply to delete the DROP rows above. " +
        "MembershipClub rows cascade automatically.",
    );
    return;
  }

  let deleted = 0;
  for (const o of overlaps) {
    // Refuse to delete anything the office already collected money for
    // and tied to a payment line — those need accounting follow-up first.
    const lines = await prisma.paymentLine.count({
      where: { membershipId: o.drop.id },
    });
    if (lines > 0) {
      console.warn(
        `  ! Skipping ${o.drop.id} (${o.drop.label}) — ${lines} payment line(s) reference it. Resolve in accounting first.`,
      );
      continue;
    }
    await prisma.membership.delete({ where: { id: o.drop.id } });
    deleted++;
    console.log(
      `  - Deleted ${o.drop.label} for household ${o.household.displayName}`,
    );
  }

  console.log();
  console.log(`Done. Deleted ${deleted}/${overlaps.length} membership(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
