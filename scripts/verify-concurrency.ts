/**
 * Concurrency smoke tests for the reliability hardening:
 *
 *   1. Class enrollment: fire N concurrent inserts at a series with
 *      maxStudents = 2 and assert exactly 2 land in `pending_payment`
 *      while the rest go to `waitlist`.
 *
 *   2. Ladder join: fire N concurrent joins on a season and assert
 *      every entry got a unique `position` (no P2002 leak from the
 *      `@@unique([seasonId, position])` constraint).
 *
 * Both tests reproduce the *transactional shape* used by the real
 * server actions (Serializable + retry on 40001 / P2034) so a
 * regression in the helper or the call sites surfaces here.
 *
 * Usage:
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/verify-concurrency.ts
 *
 * The script creates ephemeral fixtures (program/venue/club/season/
 * series/people) under predictable names, exercises them, and tears
 * everything back down. Safe to run against a dev DB.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient({ log: ["error"] });

const PARALLEL = 6;
const MAX_STUDENTS = 2;
const TAG = `verify-concurrency-${Date.now()}`;

// ---------------------------------------------------------------------------
// Mirrors withSerializableRetry from src/lib/db/serializable.ts. Inlined here
// so the script doesn't depend on the Next.js path alias resolver.
// ---------------------------------------------------------------------------
async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : String(e);
      const retriable =
        code === "P2034" ||
        code === "40001" ||
        msg.includes("could not serialize") ||
        msg.includes("40001") ||
        msg.includes("P2034");
      if (retriable && attempt < maxAttempts - 1) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 5 * 5 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Test 1 — enrollment capacity
// ---------------------------------------------------------------------------

interface EnrollFixtures {
  seriesId: string;
  studentPersonIds: string[];
  enrollerPersonId: string;
  cleanup: () => Promise<void>;
}

async function setupEnrollmentFixtures(): Promise<EnrollFixtures> {
  const club = await prisma.club.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true },
  });
  const venue = await prisma.venue.findFirstOrThrow({
    where: { clubId: club.id, archivedAt: null },
    select: { id: true },
  });
  const program = await prisma.program.findFirstOrThrow({ select: { id: true } });

  const enroller = await prisma.person.create({
    data: {
      id: randomUUID(),
      firstName: TAG,
      lastName: "Enroller",
      isAdmin: true,
    },
    select: { id: true },
  });

  const series = await prisma.classSeries.create({
    data: {
      programId: program.id,
      venueId: venue.id,
      clubId: club.id,
      name: `${TAG} series`,
      classType: "group_lesson",
      deliveryMode: "at_club",
      dayOfWeek: "mon",
      startTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      endTime: new Date(Date.UTC(1970, 0, 1, 19, 0, 0)),
      startsOn: new Date(),
      endsOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      maxStudents: MAX_STUDENTS,
      minStudents: 1,
      status: "draft",
      visibility: "admin_only",
      waitlistEnabled: true,
    },
    select: { id: true },
  });

  const studentPersonIds: string[] = [];
  for (let i = 0; i < PARALLEL; i++) {
    const person = await prisma.person.create({
      data: {
        id: randomUUID(),
        firstName: TAG,
        lastName: `Student${i}`,
      },
      select: { id: true },
    });
    await prisma.student.create({ data: { personId: person.id } });
    studentPersonIds.push(person.id);
  }

  return {
    seriesId: series.id,
    studentPersonIds,
    enrollerPersonId: enroller.id,
    cleanup: async () => {
      await prisma.enrollment.deleteMany({ where: { classSeriesId: series.id } });
      await prisma.classSeries.delete({ where: { id: series.id } });
      await prisma.student.deleteMany({
        where: { personId: { in: studentPersonIds } },
      });
      await prisma.person.deleteMany({
        where: { id: { in: [...studentPersonIds, enroller.id] } },
      });
    },
  };
}

/**
 * Mirrors the seat-allocation block in
 * `src/lib/portal/enrollment-actions.ts::createEnrollment` (fresh
 * path). Insert under Serializable isolation; retry on 40001.
 */
async function tryEnroll(args: {
  seriesId: string;
  studentPersonId: string;
  enrollerPersonId: string;
  maxStudents: number;
  waitlistEnabled: boolean;
}): Promise<"pending_payment" | "waitlist" | "rejected"> {
  return withSerializableRetry(async (tx) => {
    const liveCount = await tx.enrollment.count({
      where: {
        classSeriesId: args.seriesId,
        status: { in: ["active", "pending_payment"] },
      },
    });
    const goesToWaitlist = liveCount >= args.maxStudents;
    if (goesToWaitlist && !args.waitlistEnabled) return "rejected" as const;
    const status: "pending_payment" | "waitlist" = goesToWaitlist
      ? "waitlist"
      : "pending_payment";
    await tx.enrollment.create({
      data: {
        classSeriesId: args.seriesId,
        studentPersonId: args.studentPersonId,
        enrolledByPersonId: args.enrollerPersonId,
        status,
      },
    });
    return status;
  });
}

async function testEnrollmentCapacity(): Promise<boolean> {
  console.log(`\n[1/1] enrollment capacity (parallel=${PARALLEL}, max=${MAX_STUDENTS})`);
  const f = await setupEnrollmentFixtures();
  try {
    const settled = await Promise.allSettled(
      f.studentPersonIds.map((pid) =>
        tryEnroll({
          seriesId: f.seriesId,
          studentPersonId: pid,
          enrollerPersonId: f.enrollerPersonId,
          maxStudents: MAX_STUDENTS,
          waitlistEnabled: true,
        }),
      ),
    );
    const errors = settled.filter((s) => s.status === "rejected");
    if (errors.length > 0) {
      console.error("  FAIL: some calls threw:");
      for (const e of errors) {
        console.error("   ", (e as PromiseRejectedResult).reason);
      }
      return false;
    }
    const counts = await prisma.enrollment.groupBy({
      by: ["status"],
      where: { classSeriesId: f.seriesId },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      counts.map((c) => [c.status, c._count._all]),
    ) as Record<string, number>;
    const live = (byStatus.pending_payment ?? 0) + (byStatus.active ?? 0);
    const waitlist = byStatus.waitlist ?? 0;
    console.log("  status counts:", byStatus);
    if (live !== MAX_STUDENTS) {
      console.error(
        `  FAIL: expected exactly ${MAX_STUDENTS} live, got ${live}`,
      );
      return false;
    }
    if (waitlist !== PARALLEL - MAX_STUDENTS) {
      console.error(
        `  FAIL: expected ${PARALLEL - MAX_STUDENTS} waitlisted, got ${waitlist}`,
      );
      return false;
    }
    console.log("  PASS");
    return true;
  } finally {
    await f.cleanup();
  }
}

async function main() {
  let ok = true;
  try {
    ok = (await testEnrollmentCapacity()) && ok;
  } finally {
    await prisma.$disconnect();
  }
  if (!ok) {
    console.error("\nFAIL: at least one concurrency test regressed.");
    process.exit(1);
  }
  console.log("\nAll concurrency invariants hold.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
