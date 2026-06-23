/**
 * Hard wipe of every CRM row in the database.
 *
 * This intentionally takes the database back to a blank-but-catalog state.
 * After it runs you have:
 *   - Catalog rows (clubs, courts, programs, booking_settings,
 *     korfball recurring_blocks) — untouched.
 *   - System placeholder Person + Household — kept (seed depends on them).
 *   - Any `isAdmin = true` Person — kept (i.e. Noah, so login still works).
 *   - The matching Supabase auth.users entry for each kept person — kept.
 * Everything else (people, students, coaches, households, members, emails)
 * goes away. Auth.users entries that don't correspond to a kept person are
 * also deleted via the service-role admin client.
 *
 * Run: `npm run db:wipe-all`
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { SYSTEM_PERSON_ID, SYSTEM_HOUSEHOLD_ID } from "../src/lib/system-ids";
import { assertDestructiveConfirmed } from "./_safety";

const prisma = new PrismaClient();

async function main() {
  assertDestructiveConfirmed("db:wipe-all (all CRM data)");
  console.log("Wiping all CRM data…\n");

  // Identify the people we're keeping: System placeholder + any admin.
  const keepPeople = await prisma.person.findMany({
    where: {
      OR: [{ id: SYSTEM_PERSON_ID }, { isAdmin: true }],
    },
    select: { id: true, firstName: true, lastName: true, isAdmin: true },
  });
  const keepIds = new Set(keepPeople.map((p) => p.id));

  console.log("Keeping:");
  for (const p of keepPeople) {
    const tag = p.id === SYSTEM_PERSON_ID ? "system" : p.isAdmin ? "admin" : "?";
    console.log(`  - ${p.firstName} ${p.lastName} (${tag}) ${p.id}`);
  }
  console.log();

  // ---------------------------------------------------------------------
  // Wipe DB rows in FK-safe order.
  // ---------------------------------------------------------------------

  const memberDel = await prisma.householdMember.deleteMany({});
  console.log(`Deleted household_members: ${memberDel.count}`);

  // Households first need their primary_contact FK to be on a kept person.
  // The simplest approach: re-point every non-System household's primary
  // contact at the System placeholder, then delete those households.
  await prisma.household.updateMany({
    where: { id: { not: SYSTEM_HOUSEHOLD_ID } },
    data: { primaryContactPersonId: SYSTEM_PERSON_ID },
  });
  const householdDel = await prisma.household.deleteMany({
    where: { id: { not: SYSTEM_HOUSEHOLD_ID } },
  });
  console.log(`Deleted households: ${householdDel.count}`);

  // Students/coaches/zzpCoaches/emails are FK-bound to Person and will
  // cascade when we delete the parent Person, but delete explicitly for
  // clarity and to surface any unexpected leftovers.
  const studentDel = await prisma.student.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  console.log(`Deleted students: ${studentDel.count}`);

  const coachDel = await prisma.coach.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  console.log(`Deleted coaches: ${coachDel.count}`);

  const zzpDel = await prisma.zzpCoach.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  console.log(`Deleted zzp_coaches: ${zzpDel.count}`);

  const coachClubAccessDel = await prisma.coachClubAccess.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  console.log(`Deleted coach_club_access: ${coachClubAccessDel.count}`);

  const inviteDel = await prisma.coachInvite.deleteMany({});
  console.log(`Deleted coach_invites: ${inviteDel.count}`);

  const emailDel = await prisma.emailAddress.deleteMany({
    where: { personId: { notIn: [...keepIds] } },
  });
  console.log(`Deleted email_addresses: ${emailDel.count}`);

  const personDel = await prisma.person.deleteMany({
    where: { id: { notIn: [...keepIds] } },
  });
  console.log(`Deleted people: ${personDel.count}`);

  // ---------------------------------------------------------------------
  // Wipe orphaned Supabase auth.users.
  // ---------------------------------------------------------------------

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "\nNEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping auth.users cleanup."
    );
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\nFetching Supabase auth.users…");
  const allAuthUsers: { id: string; email?: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    allAuthUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? undefined })));
    if (data.users.length < 1000) break;
    page += 1;
  }
  console.log(`  found ${allAuthUsers.length} auth.users`);

  let deletedAuth = 0;
  for (const u of allAuthUsers) {
    if (keepIds.has(u.id)) continue;
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) {
      console.warn(`  failed to delete auth user ${u.id} (${u.email}): ${error.message}`);
    } else {
      deletedAuth += 1;
    }
  }
  console.log(`Deleted auth.users: ${deletedAuth}`);

  console.log("\nWipe complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
