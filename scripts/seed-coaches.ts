/**
 * Seed nine staff coach Person + Coach rows directly into the DB.
 *
 * No Supabase auth users, no email_addresses rows, no invites. These
 * are display-only coach records intended for assigning to private
 * lessons and other coach-facing assignments. They cannot log in.
 *
 * Why no auth: you explicitly do not want to mint real or throwaway
 * email addresses. The data model allows Person rows without an
 * accompanying auth.users row (see `SYSTEM_NO_COACH_PERSON_ID` in
 * prisma/seed.ts).
 *
 * Trade-off: if you later want one of these coaches to actually log
 * in, the acceptCoachInvite flow expects Person.id == auth.users.id.
 * To "promote" a seeded coach, delete the seeded Person+Coach rows
 * and re-invite for real (or add a small promote helper).
 *
 * No coach_club_access rows are created → "All clubs" semantics
 * (matches how /admin/coaches labels staff with no scoped access).
 *
 * Idempotent: deterministic uuidv5 ids derived from "first last".
 * Re-running the script upserts the same rows.
 *
 * Run: `npm run db:seed-coaches`
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";

const prisma = new PrismaClient();

// uuid@13 enforces a valid v1-5 namespace; reuse the RFC 4122 NS_DNS one
// (same convention as scripts/seed-examples.ts).
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

type CoachSpec = {
  firstName: string;
  lastName: string;
  knltbQualification: string;
  defaultHourlyRate: string;
  bio: string;
  joinedOn: Date;
};

const COACHES: CoachSpec[] = [
  {
    firstName: "Farah",
    lastName: "Fernandez",
    knltbQualification: "A",
    defaultHourlyRate: "95.00",
    bio: "Senior coach focused on adult performance and competitive juniors.",
    joinedOn: new Date("2022-03-01"),
  },
  {
    firstName: "Ivan",
    lastName: "Figueroa",
    knltbQualification: "B",
    defaultHourlyRate: "80.00",
    bio: "Tactics-first coach, works with intermediate adults and teens.",
    joinedOn: new Date("2023-09-01"),
  },
  {
    firstName: "Ramzi",
    lastName: "Ben Ali",
    knltbQualification: "B",
    defaultHourlyRate: "75.00",
    bio: "All-court game with a focus on serve mechanics and baseline play.",
    joinedOn: new Date("2024-01-01"),
  },
  {
    firstName: "Giorgio",
    lastName: "Crisci",
    knltbQualification: "A",
    defaultHourlyRate: "90.00",
    bio: "Performance coach with experience in junior development pathways.",
    joinedOn: new Date("2021-06-01"),
  },
  {
    firstName: "Yassine",
    lastName: "El Amrani",
    knltbQualification: "C",
    defaultHourlyRate: "65.00",
    bio: "Beginner-friendly coach, group lessons and red/orange/green ball.",
    joinedOn: new Date("2024-05-01"),
  },
  {
    firstName: "Olha",
    lastName: "Kovalenko",
    knltbQualification: "B",
    defaultHourlyRate: "80.00",
    bio: "Technical coach with a background in WTA-tour stringing and prep.",
    joinedOn: new Date("2023-02-01"),
  },
  {
    firstName: "Set",
    lastName: "Janssens",
    knltbQualification: "C",
    defaultHourlyRate: "70.00",
    bio: "Club coach for adult social play and recreational improvers.",
    joinedOn: new Date("2024-08-01"),
  },
  {
    firstName: "Melissa",
    lastName: "de Vries",
    knltbQualification: "A",
    defaultHourlyRate: "95.00",
    bio: "Long-time staff coach, runs the women's clinic programme.",
    joinedOn: new Date("2020-11-01"),
  },
  {
    firstName: "Noah",
    lastName: "Cladera",
    knltbQualification: "A",
    defaultHourlyRate: "100.00",
    bio: "Head coach. Oversees coaching staff and the competitive programme.",
    joinedOn: new Date("2020-01-01"),
  },
];

function personIdFor(spec: CoachSpec): string {
  const slug = `${spec.firstName} ${spec.lastName}`.toLowerCase().trim();
  return uuidv5(`coach-seed:${slug}`, NS);
}

function photoUrlFor(spec: CoachSpec): string {
  // DiceBear avataaars are deterministic per seed and don't put real
  // people's faces on placeholder records. Swap to a real photo via
  // /coach/profile/professional later.
  const seed = encodeURIComponent(`${spec.firstName} ${spec.lastName}`);
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`;
}

async function upsertSeedCoach(spec: CoachSpec): Promise<string> {
  const personId = personIdFor(spec);
  const photoUrl = photoUrlFor(spec);
  const rate = new Prisma.Decimal(spec.defaultHourlyRate);

  await prisma.person.upsert({
    where: { id: personId },
    create: {
      id: personId,
      firstName: spec.firstName,
      lastName: spec.lastName,
      country: "NL",
      notes: "Seeded coach (no auth user). See scripts/seed-coaches.ts.",
    },
    update: {
      firstName: spec.firstName,
      lastName: spec.lastName,
    },
  });

  await prisma.coach.upsert({
    where: { personId },
    create: {
      personId,
      employmentType: "employee",
      defaultHourlyRate: rate,
      knltbQualification: spec.knltbQualification,
      bio: spec.bio,
      photoUrl,
      isActive: true,
      joinedOn: spec.joinedOn,
    },
    update: {
      employmentType: "employee",
      defaultHourlyRate: rate,
      knltbQualification: spec.knltbQualification,
      bio: spec.bio,
      photoUrl,
      isActive: true,
      joinedOn: spec.joinedOn,
    },
  });

  return personId;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed coaches in production — these rows have no auth users.",
    );
  }

  console.log("=== Seeding nine staff coaches ===\n");

  for (const spec of COACHES) {
    const id = await upsertSeedCoach(spec);
    console.log(`  ✓ upserted ${spec.firstName} ${spec.lastName} (${id})`);
  }

  console.log("\n=== Seed complete ===");
  console.log(`Inserted/updated ${COACHES.length} coach rows.`);
  console.log("Open /admin/coaches to verify.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
