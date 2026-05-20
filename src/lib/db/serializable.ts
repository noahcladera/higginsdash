import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Run a `prisma.$transaction` callback at `Serializable` isolation and
 * automatically retry on Postgres serialization failures.
 *
 * Postgres SSI ("Serializable Snapshot Isolation") detects predicate
 * conflicts — e.g. two transactions that both `count(*)` the same set
 * of rows and then both `INSERT` into it. The losing transaction
 * commits with a `40001` (`P2034` from Prisma) "could not serialize
 * access" error. Retrying on a fresh snapshot is the canonical fix.
 *
 * Use this for any "read N rows, decide capacity, then write" path
 * (class enrollment, ladder position, waitlist promotion, …) where
 * the EXCLUDE / unique constraints alone aren't enough to express the
 * invariant.
 *
 * The callback **must** be idempotent on retry — e.g. don't `notify()`
 * or `sendEmail()` from inside it. Side-effects belong outside.
 */
export async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { maxAttempts?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (isSerializationFailure(e) && attempt < maxAttempts - 1) {
        lastErr = e;
        // Tiny exponential backoff so two contending callers don't keep
        // colliding on the same tick. 5ms / 25ms / 125ms.
        await sleep(5 * 5 ** attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * True for Postgres serialization failures (`40001`) and Prisma's
 * generic write-conflict / deadlock wrapper (`P2034`).
 */
export function isSerializationFailure(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2034") return true;
  }
  const code = (e as { code?: string } | null | undefined)?.code;
  if (code === "40001" || code === "P2034") return true;
  const message = e instanceof Error ? e.message : String(e);
  return (
    message.includes("could not serialize") ||
    message.includes("40001") ||
    message.includes("P2034")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
