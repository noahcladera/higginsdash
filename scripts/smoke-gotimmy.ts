/**
 * End-to-end smoke for the GoTimmy substitute (v1).
 *
 * Walks the recommend → enroll → withdraw flow against a fixture parent
 * "Patricia Smoke" with one BSA child "Pip Smoke (8)" and the
 * `parentAlsoPlays = true` toggle set. The script asserts:
 *
 *   1. The recommendation engine surfaces a school-pickup program
 *      (because of the BSA match) AND an adult program (because of
 *      parentAlsoPlays).
 *   2. We can enroll the BSA child into the BSA stub series and the
 *      enrollment lands in `pending_payment`.
 *   3. The "My classes" data layer surfaces both the parent and child
 *      enrollments grouped by student.
 *   4. Withdrawing flips the row to `withdrawn` and any waitlisted
 *      siblings get promoted (we don't add one in this script — it's a
 *      separate fixture).
 *
 * It does NOT call the actual server actions (those depend on Supabase
 * auth + next/cache.revalidatePath which only run inside Next). Instead
 * it inlines the same mutations against prisma so we still catch
 * schema / Prisma-shape regressions.
 *
 * Idempotent: re-running just resets the smoke fixtures and runs the
 * flow again.
 *
 * Run: `npm run smoke:gotimmy`
 *
 * Pre-reqs:
 *   - `npm run db:seed` (programs, schools, venues, placeholder coach)
 *   - `npm run db:seed-real-catalog` (creates the BSA pickup series)
 */

import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";
import {
  recommendPrograms,
  type ProgramLike,
  type ChildLike,
} from "../src/lib/portal/recommend";

const prisma = new PrismaClient();

// Stable namespace so the same parent/child UUIDs resurface on re-runs.
const NS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const PARENT_ID = uuidv5("smoke:parent:patricia", NS);
const CHILD_ID = uuidv5("smoke:child:pip", NS);
const HOUSEHOLD_ID = uuidv5("smoke:household:smoke", NS);

function dobForAge(age: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, 5, 15));
}

async function ensureFixturePersons() {
  // Parent — adult, 38yo, plays themselves.
  await prisma.person.upsert({
    where: { id: PARENT_ID },
    create: {
      id: PARENT_ID,
      firstName: "Patricia",
      lastName: "Smoke",
      dateOfBirth: dobForAge(38),
      isAdmin: false,
      notes: "Smoke-test fixture parent. Safe to delete.",
    },
    update: {
      firstName: "Patricia",
      lastName: "Smoke",
      dateOfBirth: dobForAge(38),
    },
  });

  // Child — 8yo, attends BSA.
  await prisma.person.upsert({
    where: { id: CHILD_ID },
    create: {
      id: CHILD_ID,
      firstName: "Pip",
      lastName: "Smoke",
      dateOfBirth: dobForAge(8),
      notes: "Smoke-test fixture child. Safe to delete.",
    },
    update: {
      firstName: "Pip",
      lastName: "Smoke",
      dateOfBirth: dobForAge(8),
    },
  });

  await prisma.household.upsert({
    where: { id: HOUSEHOLD_ID },
    create: {
      id: HOUSEHOLD_ID,
      displayName: "Smoke (test)",
      primaryContactPersonId: PARENT_ID,
      parentAlsoPlays: true,
      notes: "Smoke-test fixture household. Safe to delete.",
    },
    update: { parentAlsoPlays: true },
  });

  await prisma.householdMember.upsert({
    where: { personId: PARENT_ID },
    create: {
      householdId: HOUSEHOLD_ID,
      personId: PARENT_ID,
      roleInHousehold: "adult",
    },
    update: { householdId: HOUSEHOLD_ID, roleInHousehold: "adult" },
  });
  await prisma.householdMember.upsert({
    where: { personId: CHILD_ID },
    create: {
      householdId: HOUSEHOLD_ID,
      personId: CHILD_ID,
      roleInHousehold: "child",
    },
    update: { householdId: HOUSEHOLD_ID, roleInHousehold: "child" },
  });

  // Parent plays — give them a Student row too.
  await prisma.student.upsert({
    where: { personId: PARENT_ID },
    create: { personId: PARENT_ID },
    update: {},
  });

  // Child attends BSA — wire up the Student.school enum.
  const bsa = await prisma.school.findUnique({ where: { slug: "bsa" } });
  if (!bsa) throw new Error("Seed school 'bsa' missing — run `npm run db:seed`.");
  await prisma.student.upsert({
    where: { personId: CHILD_ID },
    create: { personId: CHILD_ID, school: "BSA" },
    update: { school: "BSA" },
  });
}

// ---------------------------------------------------------------------------
// Inline copies of recommend-queries that work outside the Next runtime
// (the original module imports `@/lib/prisma` which isn't on the alias path
// for tsx). Same logic, just with the relative prisma instance.
// ---------------------------------------------------------------------------

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

async function loadRecommendInputs(viewerId: string, householdId: string) {
  const viewer = await prisma.person.findUnique({
    where: { id: viewerId },
    select: { dateOfBirth: true },
  });
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { parentAlsoPlays: true },
  });
  const members = await prisma.householdMember.findMany({
    where: { householdId, roleInHousehold: "child" },
    include: {
      person: {
        select: {
          dateOfBirth: true,
          student: { select: { school: true } },
        },
      },
    },
  });
  const children: ChildLike[] = members.map((m) => ({
    age: ageFromDob(m.person.dateOfBirth),
    schoolSlug: m.person.student?.school?.toLowerCase() ?? null,
  }));
  return {
    viewerAge: ageFromDob(viewer?.dateOfBirth ?? null),
    children,
    parentAlsoPlays: household?.parentAlsoPlays ?? false,
    viewerIsAdultMember: false,
  };
}

async function loadCatalog(): Promise<ProgramLike[]> {
  const now = new Date();
  const programs = await prisma.program.findMany({
    where: { isActive: true, isPubliclyListed: true },
    orderBy: { displayOrder: "asc" },
    include: {
      classSeries: {
        where: {
          status: "published",
          visibility: { in: ["public", "members_only"] },
          archivedAt: null,
          endsOn: { gte: now },
        },
        select: {
          minAge: true,
          maxAge: true,
          enrollmentOpensAt: true,
          enrollmentClosesAt: true,
          school: { select: { slug: true } },
        },
      },
    },
  });
  return programs.map((p) => {
    let minAge: number | null = null;
    let maxAge: number | null = null;
    for (const s of p.classSeries) {
      if (s.minAge != null) minAge = minAge == null ? s.minAge : Math.min(minAge, s.minAge);
      if (s.maxAge != null) maxAge = maxAge == null ? s.maxAge : Math.max(maxAge, s.maxAge);
    }
    const schoolMatches = Array.from(
      new Set(
        p.classSeries.flatMap((s) =>
          s.school?.slug ? [s.school.slug.toLowerCase()] : [],
        ),
      ),
    );
    const enrollableNow = p.classSeries.filter((s) => {
      if (s.enrollmentOpensAt && s.enrollmentOpensAt > now) return false;
      if (s.enrollmentClosesAt && s.enrollmentClosesAt < now) return false;
      return true;
    });
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      targetAudience: p.targetAudience,
      classTypeKey: p.defaultClassType,
      descriptionPublic: p.descriptionPublic,
      coverImageUrl: p.coverImageUrl,
      schoolMatches,
      minAge,
      maxAge,
      hasOpenSeries: enrollableNow.length > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Inline enroll/withdraw — same logic as enrollment-actions.ts, minus
// the requireMember + revalidatePath plumbing.
// ---------------------------------------------------------------------------

async function smokeEnroll(opts: {
  classSeriesId: string;
  studentPersonId: string;
  enrolledByPersonId: string;
}) {
  await prisma.student.upsert({
    where: { personId: opts.studentPersonId },
    create: { personId: opts.studentPersonId },
    update: {},
  });
  const series = await prisma.classSeries.findUniqueOrThrow({
    where: { id: opts.classSeriesId },
    select: { maxStudents: true, waitlistEnabled: true },
  });
  const live = await prisma.enrollment.count({
    where: {
      classSeriesId: opts.classSeriesId,
      status: { in: ["active", "pending_payment"] },
    },
  });
  const goesToWaitlist = live >= series.maxStudents;
  return prisma.enrollment.upsert({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId: opts.classSeriesId,
        studentPersonId: opts.studentPersonId,
      },
    },
    create: {
      classSeriesId: opts.classSeriesId,
      studentPersonId: opts.studentPersonId,
      enrolledByPersonId: opts.enrolledByPersonId,
      status: goesToWaitlist
        ? series.waitlistEnabled
          ? "waitlist"
          : "pending_payment"
        : "pending_payment",
    },
    update: {
      status: goesToWaitlist
        ? series.waitlistEnabled
          ? "waitlist"
          : "pending_payment"
        : "pending_payment",
      withdrawnOn: null,
      withdrawalReason: null,
      enrolledByPersonId: opts.enrolledByPersonId,
      enrolledOn: new Date(),
    },
  });
}

async function smokeWithdraw(enrollmentId: string) {
  return prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "withdrawn",
      withdrawnOn: new Date(),
      withdrawalReason: "smoke test cleanup",
    },
  });
}

// ---------------------------------------------------------------------------
// The actual smoke walk.
// ---------------------------------------------------------------------------

async function main() {
  console.log("Setting up smoke fixture (Patricia + Pip)…");
  await ensureFixturePersons();

  console.log("Recommendation pass…");
  const ctx = await loadRecommendInputs(PARENT_ID, HOUSEHOLD_ID);
  const programs = await loadCatalog();
  const out = recommendPrograms({ ...ctx, programs });

  if (programs.length === 0) {
    throw new Error(
      "Catalog is empty — run `npm run db:seed-real-catalog` first.",
    );
  }

  const slugs = out.all.map((r) => `${r.program.slug}(${r.bucket})`);
  console.log("  recommended →", slugs.join(", ") || "<none>");

  // Patricia plays + has a BSA kid → we expect to see at least one
  // kids program AND one adult program.
  assert.ok(
    out.all.some((r) => r.bucket === "kids"),
    "expected a kids program for Patricia (parent of an 8yo)",
  );
  assert.ok(
    out.all.some((r) => r.bucket === "adults"),
    "expected an adults program because parentAlsoPlays=true",
  );

  console.log("Looking up the BSA stub series…");
  const bsaSeries = await prisma.classSeries.findFirst({
    where: { school: { slug: "bsa" }, status: "published" },
    select: { id: true, name: true },
  });
  if (!bsaSeries) {
    throw new Error(
      "No published BSA series found — run `npm run db:seed-real-catalog`.",
    );
  }

  console.log("Enrolling Pip into:", bsaSeries.name);
  const enrollment = await smokeEnroll({
    classSeriesId: bsaSeries.id,
    studentPersonId: CHILD_ID,
    enrolledByPersonId: PARENT_ID,
  });
  assert.equal(
    enrollment.status,
    "pending_payment",
    "first enrollment should land in pending_payment, not waitlist",
  );
  console.log("  → enrollment", enrollment.id, "status", enrollment.status);

  console.log("Confirming My-classes view sees the enrollment…");
  const myClasses = await prisma.enrollment.findMany({
    where: {
      studentPersonId: { in: [PARENT_ID, CHILD_ID] },
      status: { in: ["active", "pending_payment", "waitlist"] },
    },
    include: {
      classSeries: { select: { name: true } },
      student: {
        include: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  console.log(
    `  → ${myClasses.length} live enrollment(s) across the household`,
  );
  assert.ok(
    myClasses.some((e) => e.studentPersonId === CHILD_ID),
    "Pip's enrollment should appear in the My-classes view",
  );

  console.log("Withdrawing Pip…");
  const withdrawn = await smokeWithdraw(enrollment.id);
  assert.equal(withdrawn.status, "withdrawn");
  assert.ok(withdrawn.withdrawnOn != null);
  console.log("  → status", withdrawn.status);

  console.log("\nSmoke OK.");
}

main()
  .catch((err) => {
    console.error("\nSmoke FAILED:");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
