/**
 * One-off: delete specific test signup accounts by email.
 * Usage: npx dotenv -e .env.local -- tsx scripts/_delete-test-accounts.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { SYSTEM_PERSON_ID } from "../src/lib/system-ids";

const TARGET_EMAILS = [
  "vunoahcladera@gmail.com",
  "noah.cladera.garcia@student.uva.nl",
];

const prisma = new PrismaClient();

async function deleteAccountByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  console.log(`\n--- ${normalized} ---`);

  const ea = await prisma.emailAddress.findFirst({
    where: { address: { equals: normalized, mode: "insensitive" } },
    select: { personId: true },
  });

  let personId = ea?.personId;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Also check Supabase auth if no CRM email row (orphaned auth user).
  if (!personId) {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const match = data.users.find(
        (u) => u.email?.toLowerCase() === normalized,
      );
      if (match) {
        personId = match.id;
        console.log("  Found in Supabase auth only:", personId);
        break;
      }
      if (data.users.length < 1000) break;
      page += 1;
    }
  }

  if (!personId) {
    console.log("  Not found in CRM or Supabase — skipping.");
    return;
  }

  if (personId === SYSTEM_PERSON_ID) {
    console.log("  Refusing to delete system person.");
    return;
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, firstName: true, lastName: true, isAdmin: true },
  });
  if (person?.isAdmin) {
    console.log("  Refusing to delete admin person:", person);
    return;
  }
  console.log("  Person:", person);

  const memberships = await prisma.householdMember.findMany({
    where: { personId },
    select: { householdId: true },
  });
  const householdIds = [...new Set(memberships.map((m) => m.householdId))];

  for (const householdId of householdIds) {
    const members = await prisma.householdMember.findMany({
      where: { householdId },
      select: { personId: true, roleInHousehold: true },
    });
    const memberIds = members.map((m) => m.personId);
    console.log(`  Household ${householdId}: members ${memberIds.join(", ")}`);

    await prisma.householdMember.deleteMany({ where: { householdId } });

    for (const memberId of memberIds) {
      if (memberId === SYSTEM_PERSON_ID) continue;
      const p = await prisma.person.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      if (p?.isAdmin) continue;
      await prisma.student.deleteMany({ where: { personId: memberId } });
      await prisma.emailAddress.deleteMany({ where: { personId: memberId } });
      await prisma.person.delete({ where: { id: memberId } });
      console.log(`  Deleted person ${memberId}`);
      const { error } = await admin.auth.admin.deleteUser(memberId);
      if (error) {
        console.warn(`  Auth delete ${memberId}: ${error.message}`);
      } else {
        console.log(`  Deleted auth user ${memberId}`);
      }
    }

    await prisma.household.delete({ where: { id: householdId } });
    console.log(`  Deleted household ${householdId}`);
  }

  // Person not in a household (edge case).
  if (householdIds.length === 0) {
    await prisma.student.deleteMany({ where: { personId } });
    await prisma.emailAddress.deleteMany({ where: { personId } });
    await prisma.householdMember.deleteMany({ where: { personId } });
    await prisma.person.delete({ where: { id: personId } });
    console.log(`  Deleted person ${personId}`);
    const { error } = await admin.auth.admin.deleteUser(personId);
    if (error) {
      console.warn(`  Auth delete: ${error.message}`);
    } else {
      console.log(`  Deleted auth user ${personId}`);
    }
  }
}

async function main() {
  for (const email of TARGET_EMAILS) {
    await deleteAccountByEmail(email);
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
