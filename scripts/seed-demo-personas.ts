/**
 * Four canonical demo personas for Spring 2026 portal testing.
 *
 *   1. student.demo@…        — adult student (self-enroll)
 *   2. parent.demo@…         — parent + 1 child, parentAlsoPlays=false
 *   3. parent.multi.demo@…   — parent + 3 kids, parentAlsoPlays=false
 *   4. parent.plays.demo@…   — parent + 2 kids, parentAlsoPlays=true
 *
 * Password for all: higgins-test
 *
 * Run: npm run db:seed-demo-personas
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v5 as uuidv5 } from "uuid";

const prisma = new PrismaClient();
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TEST_PASSWORD = "higgins-test";

type SupaAdmin = SupabaseClient;

async function getOrCreateAuthUser(admin: SupaAdmin, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const found = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  let userId: string;
  if (found) {
    userId = found.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr || !created.user) throw createErr ?? new Error(`Failed auth ${email}`);
    userId = created.user.id;
  }
  await admin.auth.admin.updateUserById(userId, { password: TEST_PASSWORD });
  return userId;
}

async function upsertAdult(
  admin: SupaAdmin,
  spec: {
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: "male" | "female";
    phone: string;
    notes: string;
  },
): Promise<string> {
  const personId = await getOrCreateAuthUser(admin, spec.email);
  await prisma.person.upsert({
    where: { id: personId },
    create: {
      id: personId,
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      phone: spec.phone,
      country: "NL",
      notes: spec.notes,
    },
    update: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      phone: spec.phone,
      notes: spec.notes,
    },
  });

  const existingEmail = await prisma.emailAddress.findUnique({
    where: { address: spec.email },
  });
  if (!existingEmail) {
    await prisma.emailAddress.create({
      data: {
        personId,
        address: spec.email,
        kind: "personal",
        isPrimary: true,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
  }

  return personId;
}

async function upsertChild(spec: {
  slug: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: "male" | "female";
  school: string;
  skillLevel:
    | "red_1" | "orange_2" | "orange_3" | "green_2" | "yellow" | "adult_intermediate";
}): Promise<string> {
  const personId = uuidv5(`demo-person:${spec.slug}`, NS);
  await prisma.person.upsert({
    where: { id: personId },
    create: {
      id: personId,
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      country: "NL",
      notes: "Demo persona child.",
    },
    update: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
    },
  });

  await prisma.student.upsert({
    where: { personId },
    create: {
      personId,
      enrollmentStatus: "active",
      school: spec.school,
      skillLevel: spec.skillLevel,
      joinedOn: new Date(),
    },
    update: {
      school: spec.school,
      skillLevel: spec.skillLevel,
      enrollmentStatus: "active",
    },
  });

  return personId;
}

async function getClubIds() {
  const [t, r] = await Promise.all([
    prisma.club.findUnique({ where: { slug: "triaz" }, select: { id: true } }),
    prisma.club.findUnique({ where: { slug: "randwijck" }, select: { id: true } }),
  ]);
  if (!t || !r) throw new Error("Run db:seed first — clubs missing.");
  return { triaz: t.id, randwijck: r.id };
}

async function upsertHousehold(args: {
  slug: string;
  displayName: string;
  primaryContactPersonId: string;
  parentAlsoPlays: boolean;
  addressLine1: string;
  postalCode: string;
  city: string;
  members: { personId: string; role: "adult" | "child" }[];
}): Promise<string> {
  const householdId = uuidv5(`demo-household:${args.slug}`, NS);
  await prisma.household.upsert({
    where: { id: householdId },
    create: {
      id: householdId,
      displayName: args.displayName,
      primaryContactPersonId: args.primaryContactPersonId,
      parentAlsoPlays: args.parentAlsoPlays,
      addressLine1: args.addressLine1,
      postalCode: args.postalCode,
      city: args.city,
      country: "NL",
      notes: "Spring 2026 demo household.",
    },
    update: {
      displayName: args.displayName,
      primaryContactPersonId: args.primaryContactPersonId,
      parentAlsoPlays: args.parentAlsoPlays,
      addressLine1: args.addressLine1,
      postalCode: args.postalCode,
      city: args.city,
    },
  });

  for (const m of args.members) {
    await prisma.householdMember.upsert({
      where: { personId: m.personId },
      create: {
        householdId,
        personId: m.personId,
        roleInHousehold: m.role,
      },
      update: {
        householdId,
        roleInHousehold: m.role,
      },
    });
  }

  return householdId;
}

async function upsertMembership(args: {
  slug: string;
  householdId: string;
  coverageTier: "adult" | "family";
  clubIds: string[];
  pricePaid: number;
  assignedPersonId?: string;
}): Promise<void> {
  const membershipId = uuidv5(`demo-membership:${args.slug}`, NS);
  const startsOn = new Date();
  startsOn.setUTCHours(0, 0, 0, 0);
  const expiresOn = new Date(startsOn);
  expiresOn.setUTCFullYear(expiresOn.getUTCFullYear() + 1);

  await prisma.$transaction(async (tx) => {
    await tx.membershipClub.deleteMany({ where: { membershipId } });

    await tx.membership.upsert({
      where: { id: membershipId },
      create: {
        id: membershipId,
        householdId: args.householdId,
        assignedPersonId: args.assignedPersonId ?? null,
        coverageTier: args.coverageTier,
        startsOn,
        expiresOn,
        status: "active",
        pricePaid: new Prisma.Decimal(args.pricePaid),
        paidAt: new Date(),
      },
      update: {
        householdId: args.householdId,
        assignedPersonId: args.assignedPersonId ?? null,
        coverageTier: args.coverageTier,
        startsOn,
        expiresOn,
        status: "active",
        pricePaid: new Prisma.Decimal(args.pricePaid),
      },
    });

    await tx.membershipClub.createMany({
      data: args.clubIds.map((clubId) => ({ membershipId, clubId })),
    });
  });
}

export async function seedDemoPersonas(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo personas in production.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase env vars required for demo personas.");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const clubs = await getClubIds();

  // 1. Adult student
  console.log("  student.demo — adult student");
  const studentId = await upsertAdult(admin, {
    email: "student.demo@higginstennisnl.test",
    firstName: "Anna",
    lastName: "de Vries",
    dateOfBirth: new Date("1992-08-22"),
    gender: "female",
    phone: "+31 6 22223333",
    notes: "Demo: adult student, self-enroll.",
  });
  await prisma.student.upsert({
    where: { personId: studentId },
    create: {
      personId: studentId,
      enrollmentStatus: "active",
      skillLevel: "adult_intermediate",
      joinedOn: new Date(),
    },
    update: { skillLevel: "adult_intermediate", enrollmentStatus: "active" },
  });
  const studentHousehold = await upsertHousehold({
    slug: "student-demo",
    displayName: "Anna de Vries",
    primaryContactPersonId: studentId,
    parentAlsoPlays: false,
    addressLine1: "Singel 100",
    postalCode: "1012XY",
    city: "Amsterdam",
    members: [{ personId: studentId, role: "adult" }],
  });
  await upsertMembership({
    slug: "student-demo",
    householdId: studentHousehold,
    coverageTier: "adult",
    assignedPersonId: studentId,
    clubIds: [clubs.triaz, clubs.randwijck],
    pricePaid: 150,
  });

  // 2. Parent + 1 child, doesn't play
  console.log("  parent.demo — parent + 1 child");
  const parentId = await upsertAdult(admin, {
    email: "parent.demo@higginstennisnl.test",
    firstName: "Beatrice",
    lastName: "Jansen",
    dateOfBirth: new Date("1985-03-10"),
    gender: "female",
    phone: "+31 6 11112222",
    notes: "Demo: parent, parentAlsoPlays=false.",
  });
  const child1Id = await upsertChild({
    slug: "bobby-jansen-demo",
    firstName: "Bobby",
    lastName: "Jansen",
    dateOfBirth: new Date("2014-06-21"),
    gender: "male",
    school: "AICS",
    skillLevel: "orange_2",
  });
  const parentHousehold = await upsertHousehold({
    slug: "parent-demo",
    displayName: "Family Jansen",
    primaryContactPersonId: parentId,
    parentAlsoPlays: false,
    addressLine1: "Bloemstraat 12",
    postalCode: "1016HK",
    city: "Amsterdam",
    members: [
      { personId: parentId, role: "adult" },
      { personId: child1Id, role: "child" },
    ],
  });
  await upsertMembership({
    slug: "parent-demo",
    householdId: parentHousehold,
    coverageTier: "family",
    clubIds: [clubs.triaz, clubs.randwijck],
    pricePaid: 300,
  });

  // 3. Parent + 3 kids, doesn't play
  console.log("  parent.multi.demo — parent + 3 kids");
  const multiParentId = await upsertAdult(admin, {
    email: "parent.multi.demo@higginstennisnl.test",
    firstName: "Carla",
    lastName: "van den Berg",
    dateOfBirth: new Date("1980-11-02"),
    gender: "female",
    phone: "+31 6 55556666",
    notes: "Demo: multi-child parent, parentAlsoPlays=false.",
  });
  const charlieId = await upsertChild({
    slug: "charlie-vdb-demo",
    firstName: "Charlie",
    lastName: "van den Berg",
    dateOfBirth: new Date("2011-02-18"),
    gender: "female",
    school: "IFS",
    skillLevel: "green_2",
  });
  const caraId = await upsertChild({
    slug: "cara-vdb-demo",
    firstName: "Cara",
    lastName: "van den Berg",
    dateOfBirth: new Date("2014-09-30"),
    gender: "female",
    school: "BSA",
    skillLevel: "orange_3",
  });
  const coenId = await upsertChild({
    slug: "coen-vdb-demo",
    firstName: "Coen",
    lastName: "van den Berg",
    dateOfBirth: new Date("2017-12-05"),
    gender: "male",
    school: "Kindercampus",
    skillLevel: "red_1",
  });
  const multiHousehold = await upsertHousehold({
    slug: "parent-multi-demo",
    displayName: "Family van den Berg",
    primaryContactPersonId: multiParentId,
    parentAlsoPlays: false,
    addressLine1: "Prinsengracht 250",
    postalCode: "1016HE",
    city: "Amsterdam",
    members: [
      { personId: multiParentId, role: "adult" },
      { personId: charlieId, role: "child" },
      { personId: caraId, role: "child" },
      { personId: coenId, role: "child" },
    ],
  });
  await upsertMembership({
    slug: "parent-multi-demo",
    householdId: multiHousehold,
    coverageTier: "family",
    clubIds: [clubs.triaz],
    pricePaid: 200,
  });

  // 4. Parent + 2 kids, also plays
  console.log("  parent.plays.demo — parent + 2 kids, parentAlsoPlays=true");
  const playsParentId = await upsertAdult(admin, {
    email: "parent.plays.demo@higginstennisnl.test",
    firstName: "Patricia",
    lastName: "Smits",
    dateOfBirth: new Date("1987-04-15"),
    gender: "female",
    phone: "+31 6 44445555",
    notes: "Demo: parent who also plays tennis.",
  });
  await prisma.student.upsert({
    where: { personId: playsParentId },
    create: {
      personId: playsParentId,
      enrollmentStatus: "active",
      skillLevel: "adult_intermediate",
      joinedOn: new Date(),
    },
    update: { skillLevel: "adult_intermediate", enrollmentStatus: "active" },
  });
  const pipId = await upsertChild({
    slug: "pip-smits-demo",
    firstName: "Pip",
    lastName: "Smits",
    dateOfBirth: new Date("2017-05-15"),
    gender: "male",
    school: "BSA",
    skillLevel: "red_1",
  });
  const noaId = await upsertChild({
    slug: "noa-smits-demo",
    firstName: "Noa",
    lastName: "Smits",
    dateOfBirth: new Date("2013-08-20"),
    gender: "female",
    school: "AICS",
    skillLevel: "orange_2",
  });
  const playsHousehold = await upsertHousehold({
    slug: "parent-plays-demo",
    displayName: "Family Smits",
    primaryContactPersonId: playsParentId,
    parentAlsoPlays: true,
    addressLine1: "Herengracht 80",
    postalCode: "1015BS",
    city: "Amsterdam",
    members: [
      { personId: playsParentId, role: "adult" },
      { personId: pipId, role: "child" },
      { personId: noaId, role: "child" },
    ],
  });
  await upsertMembership({
    slug: "parent-plays-demo",
    householdId: playsHousehold,
    coverageTier: "family",
    clubIds: [clubs.triaz, clubs.randwijck],
    pricePaid: 300,
  });
}

async function main() {
  console.log("=== Seeding demo personas ===\n");
  await seedDemoPersonas();
  console.log("\n=== Demo personas complete ===");
  console.log(`Password for all: "${TEST_PASSWORD}"`);
  console.log("  student.demo@higginstennisnl.test       — adult student");
  console.log("  parent.demo@higginstennisnl.test        — parent + 1 child");
  console.log("  parent.multi.demo@higginstennisnl.test  — parent + 3 kids");
  console.log("  parent.plays.demo@higginstennisnl.test  — parent who also plays");
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("seed-demo-personas.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
