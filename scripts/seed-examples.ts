/**
 * Seed four canonical example records that exercise every kind of CRM
 * shape we care about.
 *
 * @deprecated Use `npm run db:seed-demo-personas` for the four Spring 2026
 * demo login personas (student, parent, multi-child, parent-who-plays).
 *
 *   1. A coach (Carlos Mendez)                           — Coach + Person + auth
 *   2. An adult student (Anna de Vries)                  — Student + Person + auth, no household
 *   3. A two-parent, one-child household (Family Jansen)
 *      - Beatrice  (parent, primary contact, auth)
 *      - Pieter    (parent, second adult, auth)
 *      - Bobby     (child student) — no explicit emergency contact set,
 *                  so the UI falls back to "both household guardians"
 *   4. A single-parent, multi-child household (Family van den Berg)
 *      - Carla    (parent, primary contact, auth)
 *      - Charlie  (child student, ~15)
 *      - Cara     (child student, ~11)
 *      - Coen     (child student, ~8)
 *      Each kid's explicit emergency contact = Carla (only parent).
 *
 * Across all examples every Gender enum value is represented at least
 * once: male, female, other, prefer_not_to_say.
 *
 * Every adult gets a real Supabase auth.users row via the service-role
 * admin client, using the same UUID for both auth.users.id and
 * people.id. That means once you visit /login with one of these emails
 * the existing `ensurePersonForAuthUser` helper will recognise them and
 * just bump `last_login_at` instead of creating a duplicate Person row.
 *
 * Idempotent: re-running the script will reuse existing rows by id.
 *
 * Run: `npm run db:seed-examples`
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v5 as uuidv5 } from "uuid";

const prisma = new PrismaClient();

// Stable namespace used to derive deterministic ids for non-auth rows
// (children, households). Adult ids come from Supabase auth.users.id.
// uuid@13 enforces a valid v1–5 namespace, so use the RFC 4122 NS_DNS one.
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Shared password applied to every example auth user so you can log in
 * as any persona during development. Magic-links don't work for these
 * since the addresses are .test domains nobody owns.
 *
 * NEVER seed this password in production. The script bails if NODE_ENV
 * is "production" before touching anything.
 */
const TEST_PASSWORD = "higgins-test";

type SupaAdmin = SupabaseClient;

/**
 * Idempotent: if an auth user with this email exists, return its id.
 * Otherwise create one (email pre-confirmed) and return the new id.
 *
 * Either way, we (re)set the dev test password so you can always log in.
 */
async function getOrCreateAuthUser(
  admin: SupaAdmin,
  email: string,
): Promise<string> {
  // listUsers is paginated; for a freshly-wiped DB it should fit in one page.
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  const found = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  let userId: string;
  if (found) {
    console.log(`  reusing auth user ${email} (${found.id})`);
    userId = found.id;
  } else {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      throw createErr ?? new Error(`Failed to create auth user ${email}`);
    }
    console.log(`  created auth user ${email} (${created.user.id})`);
    userId = created.user.id;
  }

  // Always (re)apply the dev password so existing seed users from before we
  // added password support still pick it up.
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
    password: TEST_PASSWORD,
  });
  if (pwErr) {
    throw pwErr;
  }

  return userId;
}

type AdultSpec = {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  phone: string | null;
  addressLine1: string | null;
  addressLine2?: string | null;
  postalCode: string | null;
  city: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  notes: string;
};

async function upsertAdult(
  admin: SupaAdmin,
  spec: AdultSpec,
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
      addressLine1: spec.addressLine1,
      addressLine2: spec.addressLine2 ?? null,
      postalCode: spec.postalCode,
      city: spec.city,
      country: "NL",
      emergencyContactName: spec.emergencyContactName,
      emergencyContactPhone: spec.emergencyContactPhone,
      emergencyContactRelationship: spec.emergencyContactRelationship,
      notes: spec.notes,
    },
    update: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      phone: spec.phone,
      addressLine1: spec.addressLine1,
      addressLine2: spec.addressLine2 ?? null,
      postalCode: spec.postalCode,
      city: spec.city,
      country: "NL",
      emergencyContactName: spec.emergencyContactName,
      emergencyContactPhone: spec.emergencyContactPhone,
      emergencyContactRelationship: spec.emergencyContactRelationship,
      notes: spec.notes,
    },
  });

  // Make sure the email is captured. ensurePersonForAuthUser would do this
  // on first login, but we want it visible in /admin/people right away.
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

type ChildSpec = {
  /** Stable handle used to derive a uuidv5; e.g. "bobby-jansen". */
  slug: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  school: string;
  skillLevel:
    | "red_1" | "red_2" | "red_3"
    | "orange_1" | "orange_2" | "orange_3"
    | "green_1" | "green_2"
    | "yellow";
  /**
   * When null, no explicit emergency contact is stored on the child and
   * the UI falls back to the household's adult guardians. Use this when
   * the family has 2 parents and we want them to choose later.
   */
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
};

async function upsertChild(spec: ChildSpec): Promise<string> {
  const personId = uuidv5(`person:${spec.slug}`, NS);

  await prisma.person.upsert({
    where: { id: personId },
    create: {
      id: personId,
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      country: "NL",
      emergencyContactName: spec.emergencyContactName,
      emergencyContactPhone: spec.emergencyContactPhone,
      emergencyContactRelationship: spec.emergencyContactRelationship,
      notes: "Example seed: child student.",
    },
    update: {
      firstName: spec.firstName,
      lastName: spec.lastName,
      dateOfBirth: spec.dateOfBirth,
      gender: spec.gender,
      emergencyContactName: spec.emergencyContactName,
      emergencyContactPhone: spec.emergencyContactPhone,
      emergencyContactRelationship: spec.emergencyContactRelationship,
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
    },
  });

  return personId;
}

/**
 * Look up clubs by slug. Both 'triaz' and 'randwijck' are upserted by the
 * catalog seed (`prisma/seed.ts`); we just resolve the ids here so the
 * example seed can attach memberships to them.
 */
async function getClubIds(): Promise<{ triaz: string; randwijck: string }> {
  const [t, r] = await Promise.all([
    prisma.club.findUnique({ where: { slug: "triaz" }, select: { id: true } }),
    prisma.club.findUnique({
      where: { slug: "randwijck" },
      select: { id: true },
    }),
  ]);
  if (!t || !r) {
    throw new Error(
      "Triaz / Randwijck clubs missing — run `npm run db:seed` first.",
    );
  }
  return { triaz: t.id, randwijck: r.id };
}

/**
 * Upsert a household membership covering the listed clubs. Idempotent on
 * (householdId, kind) — if a membership already exists for that household
 * + kind, refresh its dates / status / club coverage.
 *
 * Dates are deterministic: starts_on = today (00:00 local), expires_on =
 * +12 months. The seed should produce a stable record across re-runs.
 */
async function upsertMembership(args: {
  slug: string;
  householdId: string;
  coverageTier: "adult" | "child" | "family";
  clubIds: string[];
  pricePaid: number;
  /** Required when coverageTier is adult or child (DB CHECK constraint). */
  assignedPersonId?: string;
}): Promise<void> {
  const membershipId = uuidv5(`membership:${args.slug}`, NS);

  const startsOn = new Date();
  startsOn.setUTCHours(0, 0, 0, 0);
  const expiresOn = new Date(startsOn);
  expiresOn.setUTCFullYear(expiresOn.getUTCFullYear() + 1);

  if (args.clubIds.length === 0) {
    throw new Error(`upsertMembership(${args.slug}): active membership needs ≥1 club`);
  }

  // Transaction order matters: DB trigger M1 rejects active memberships with zero clubs.
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
        paidAt: new Date(),
      },
    });

    await tx.membershipClub.createMany({
      data: args.clubIds.map((clubId) => ({ membershipId, clubId })),
    });
  });
}

async function upsertHousehold(args: {
  slug: string;
  displayName: string;
  primaryContactPersonId: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  members: { personId: string; role: "adult" | "child" }[];
}): Promise<string> {
  const householdId = uuidv5(`household:${args.slug}`, NS);

  await prisma.household.upsert({
    where: { id: householdId },
    create: {
      id: householdId,
      displayName: args.displayName,
      primaryContactPersonId: args.primaryContactPersonId,
      addressLine1: args.addressLine1,
      postalCode: args.postalCode,
      city: args.city,
      country: "NL",
      notes: "Example seed.",
    },
    update: {
      displayName: args.displayName,
      primaryContactPersonId: args.primaryContactPersonId,
      addressLine1: args.addressLine1,
      postalCode: args.postalCode,
      city: args.city,
      country: "NL",
    },
  });

  // HouseholdMember.personId is unique → upsert via that.
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

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed example users in production — they all share the dev test password.",
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("=== Seeding example records ===\n");

  // -------------------------------------------------------------------
  // 1. Coach
  // -------------------------------------------------------------------
  console.log("Coach: Carlos Mendez");
  const carlosId = await upsertAdult(admin, {
    email: "coach.example@higginstennisnl.test",
    firstName: "Carlos",
    lastName: "Mendez",
    dateOfBirth: new Date("1988-05-14"),
    gender: "male",
    phone: "+31 6 12345678",
    addressLine1: "Coachlaan 1",
    postalCode: "1011AB",
    city: "Amsterdam",
    emergencyContactName: "Maria Mendez",
    emergencyContactPhone: "+31 6 87654321",
    emergencyContactRelationship: "Spouse",
    notes: "Example seed: head coach.",
  });
  await prisma.coach.upsert({
    where: { personId: carlosId },
    create: {
      personId: carlosId,
      employmentType: "employee",
      defaultHourlyRate: new Prisma.Decimal("45.00"),
      knltbQualification: "B",
      bio: "Example coach record. Use for testing coach-facing flows.",
      isActive: true,
      joinedOn: new Date("2024-01-01"),
    },
    update: {
      employmentType: "employee",
      defaultHourlyRate: new Prisma.Decimal("45.00"),
      knltbQualification: "B",
      isActive: true,
    },
  });

  // -------------------------------------------------------------------
  // 2. Adult student (lives alone in a one-person household).
  //    A household is required to attach a Membership (R2 says court
  //    bookings need an active membership covering the court's club).
  // -------------------------------------------------------------------
  console.log("\nAdult student: Anna de Vries");
  const annaId = await upsertAdult(admin, {
    email: "adult.example@higginstennisnl.test",
    firstName: "Anna",
    lastName: "de Vries",
    dateOfBirth: new Date("1992-08-22"),
    gender: "female",
    phone: "+31 6 22223333",
    addressLine1: "Singel 100",
    postalCode: "1012XY",
    city: "Amsterdam",
    emergencyContactName: "Lotte de Vries",
    emergencyContactPhone: "+31 6 99988877",
    emergencyContactRelationship: "Sister",
    notes: "Example seed: adult student, lives alone, no household.",
  });
  await prisma.student.upsert({
    where: { personId: annaId },
    create: {
      personId: annaId,
      enrollmentStatus: "active",
      skillLevel: "adult_intermediate",
      joinedOn: new Date(),
    },
    update: {
      enrollmentStatus: "active",
      skillLevel: "adult_intermediate",
    },
  });
  await upsertHousehold({
    slug: "household-anna-devries",
    displayName: "Anna de Vries",
    primaryContactPersonId: annaId,
    addressLine1: "Singel 100",
    postalCode: "1012XY",
    city: "Amsterdam",
    members: [{ personId: annaId, role: "adult" }],
  });

  // -------------------------------------------------------------------
  // 3. Two-parent, one-child household: Beatrice + Pieter + Bobby Jansen
  //    Emergency contact on Bobby is intentionally left empty so the UI
  //    falls back to "household guardians" and the family can pick later.
  // -------------------------------------------------------------------
  console.log("\nTwo-parent household: Family Jansen");
  const beatriceId = await upsertAdult(admin, {
    email: "parent.single.example@higginstennisnl.test",
    firstName: "Beatrice",
    lastName: "Jansen",
    dateOfBirth: new Date("1985-03-10"),
    gender: "female",
    phone: "+31 6 11112222",
    addressLine1: null,
    postalCode: null,
    city: null,
    emergencyContactName: "Pieter Jansen",
    emergencyContactPhone: "+31 6 33334444",
    emergencyContactRelationship: "Spouse",
    notes: "Example seed: parent (primary contact) in a two-parent household.",
  });
  const pieterId = await upsertAdult(admin, {
    email: "parent.partner.example@higginstennisnl.test",
    firstName: "Pieter",
    lastName: "Jansen",
    dateOfBirth: new Date("1983-07-04"),
    gender: "prefer_not_to_say",
    phone: "+31 6 33334444",
    addressLine1: null,
    postalCode: null,
    city: null,
    emergencyContactName: "Beatrice Jansen",
    emergencyContactPhone: "+31 6 11112222",
    emergencyContactRelationship: "Spouse",
    notes: "Example seed: second adult in a two-parent household.",
  });
  const bobbyId = await upsertChild({
    slug: "bobby-jansen",
    firstName: "Bobby",
    lastName: "Jansen",
    dateOfBirth: new Date("2014-06-21"),
    gender: "male",
    school: "AICS",
    skillLevel: "orange_2",
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
  });
  await upsertHousehold({
    slug: "family-jansen",
    displayName: "Family Jansen",
    primaryContactPersonId: beatriceId,
    addressLine1: "Bloemstraat 12",
    postalCode: "1016HK",
    city: "Amsterdam",
    members: [
      { personId: beatriceId, role: "adult" },
      { personId: pieterId, role: "adult" },
      { personId: bobbyId, role: "child" },
    ],
  });

  // -------------------------------------------------------------------
  // 4. Single-parent, multi-child household: Carla van den Berg + 3 kids
  //    Carla is the only adult, so each kid's explicit emergency
  //    contact = Carla.
  // -------------------------------------------------------------------
  console.log("\nSingle-parent multi-child household: Family van den Berg");
  const carlaId = await upsertAdult(admin, {
    email: "parent.multi.example@higginstennisnl.test",
    firstName: "Carla",
    lastName: "van den Berg",
    dateOfBirth: new Date("1980-11-02"),
    gender: "female",
    phone: "+31 6 55556666",
    addressLine1: null,
    postalCode: null,
    city: null,
    emergencyContactName: "Marieke van den Berg",
    emergencyContactPhone: "+31 6 77778888",
    emergencyContactRelationship: "Sister",
    notes: "Example seed: single parent in a multi-child household.",
  });
  const charlieId = await upsertChild({
    slug: "charlie-vandenberg",
    firstName: "Charlie",
    lastName: "van den Berg",
    dateOfBirth: new Date("2011-02-18"),
    gender: "other",
    school: "IFS",
    skillLevel: "green_2",
    emergencyContactName: "Carla van den Berg",
    emergencyContactPhone: "+31 6 55556666",
    emergencyContactRelationship: "Mother",
  });
  const caraId = await upsertChild({
    slug: "cara-vandenberg",
    firstName: "Cara",
    lastName: "van den Berg",
    dateOfBirth: new Date("2014-09-30"),
    gender: "female",
    school: "BSA",
    skillLevel: "orange_3",
    emergencyContactName: "Carla van den Berg",
    emergencyContactPhone: "+31 6 55556666",
    emergencyContactRelationship: "Mother",
  });
  const coenId = await upsertChild({
    slug: "coen-vandenberg",
    firstName: "Coen",
    lastName: "van den Berg",
    dateOfBirth: new Date("2017-12-05"),
    gender: "male",
    school: "Kindercampus",
    skillLevel: "red_1",
    emergencyContactName: "Carla van den Berg",
    emergencyContactPhone: "+31 6 55556666",
    emergencyContactRelationship: "Mother",
  });
  await upsertHousehold({
    slug: "family-vandenberg",
    displayName: "Family van den Berg",
    primaryContactPersonId: carlaId,
    addressLine1: "Prinsengracht 250",
    postalCode: "1016HE",
    city: "Amsterdam",
    members: [
      { personId: carlaId, role: "adult" },
      { personId: charlieId, role: "child" },
      { personId: caraId, role: "child" },
      { personId: coenId, role: "child" },
    ],
  });

  // -------------------------------------------------------------------
  // 5. Memberships (R2: required to book a court at the relevant club).
  //    Coverage matrix:
  //      - Anna de Vries        → individual, Triaz + Randwijck
  //      - Family Jansen        → family,     Triaz + Randwijck
  //      - Family van den Berg  → family,     Triaz only
  // -------------------------------------------------------------------
  console.log("\nMemberships");
  const clubs = await getClubIds();

  await upsertMembership({
    slug: "anna-devries",
    householdId: uuidv5("household:household-anna-devries", NS),
    coverageTier: "adult",
    assignedPersonId: annaId,
    clubIds: [clubs.triaz, clubs.randwijck],
    pricePaid: 150,
  });
  console.log("  Anna de Vries → adult joint (Triaz + Randwijck), €150");

  await upsertMembership({
    slug: "family-jansen",
    householdId: uuidv5("household:family-jansen", NS),
    coverageTier: "family",
    clubIds: [clubs.triaz, clubs.randwijck],
    pricePaid: 300,
  });
  console.log("  Family Jansen → family joint (Triaz + Randwijck), €300");

  await upsertMembership({
    slug: "family-vandenberg",
    householdId: uuidv5("household:family-vandenberg", NS),
    coverageTier: "family",
    clubIds: [clubs.triaz],
    pricePaid: 200,
  });
  console.log("  Family van den Berg → family Triaz only, €200");

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  const counts = {
    people: await prisma.person.count(),
    households: await prisma.household.count(),
    householdMembers: await prisma.householdMember.count(),
    students: await prisma.student.count(),
    coaches: await prisma.coach.count(),
    emails: await prisma.emailAddress.count(),
    memberships: await prisma.membership.count(),
    membershipClubs: await prisma.membershipClub.count(),
  };

  console.log("\n=== Seed complete ===");
  console.table(counts);
  console.log(`\nLogin credentials  (password for all: "${TEST_PASSWORD}")`);
  console.log("  coach.example@higginstennisnl.test            (Carlos · coach)");
  console.log("  adult.example@higginstennisnl.test            (Anna · adult student)");
  console.log("  parent.single.example@higginstennisnl.test    (Beatrice · parent, primary contact)");
  console.log("  parent.partner.example@higginstennisnl.test   (Pieter · second parent)");
  console.log("  parent.multi.example@higginstennisnl.test     (Carla · single parent of 3)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
