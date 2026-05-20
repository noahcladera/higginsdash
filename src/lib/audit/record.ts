/**
 * Standard helper for writing `audit_log` rows.
 *
 * **The rule:** every destructive or status-changing write that is not
 * pure UI revalidation must call `recordAudit({ tx })` *inside the same
 * transaction* as the business write. If the write is a simple `update`,
 * wrap both calls in `prisma.$transaction(async (tx) => { ... })` so the
 * audit row commits atomically — a half-written audit trail is worse
 * than none.
 *
 * Current coverage (kept here so a glance is enough to spot the next
 * gap; grep `recordAudit` for the authoritative list):
 *
 *   • bookings: create, immediate cancel, coach cancellation request,
 *     admin approve / deny, recurring-block decision flow.
 *   • memberships: create + upgrade (portal), cancel + cancellation
 *     request flow.
 *   • enrollments: portal create / re-enroll, withdraw, waitlist
 *     promotion, admin remove + waitlist promotion.
 *   • class series: create, publish, unpublish, cancel session.
 *   • payments / refunds: refund record (admin), payment line writes.
 *   • coach subs: request, accept, decline, cancel.
 *   • attendance: bulk write.
 *   • people / households: archive + restore.
 *
 * Anything else that mutates a row (delete, status flip, soft-archive)
 * still needs to be added — search for `prisma\.\w+\.(create|update|
 * updateMany|delete)` callsites that lack a paired `recordAudit` and
 * either add one or leave a code comment explaining why the write is
 * audit-exempt (e.g. session-touch on lastLoginAt).
 *
 * Pass `tx` so the audit row commits with the business write.
 */

import type { AuditAction, AuditChangeSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface RecordAuditInput {
  tableName: string;
  /** Primary key of the mutated row. Must be a UUID string (`@db.Uuid`). For `organizations` (slug PK), use {@link auditRowIdForOrganizationSlug}. */
  rowId: string;
  action: AuditAction;
  changedByPersonId: string | null;
  /** Snapshot of the row prior to mutation. Optional for `insert`. */
  before?: unknown;
  /** Snapshot of the diff or final state. Optional for `delete`. */
  after?: unknown;
  /** Defaults to `web_app`. Set to `admin_console` for admin surfaces. */
  changeSource?: AuditChangeSource;
  /** Optional request id for cross-row correlation (e.g. one workflow). */
  requestId?: string;
  /** Bind to a `prisma.$transaction` callback. */
  tx?: Prisma.TransactionClient;
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
  const client = input.tx ?? prisma;
  await client.auditLog.create({
    data: {
      tableName: input.tableName,
      rowId: input.rowId,
      action: input.action,
      changedByPersonId: input.changedByPersonId,
      before: serializableSnapshot(input.before),
      after: serializableSnapshot(input.after),
      changeSource: input.changeSource ?? "web_app",
      requestId: input.requestId ?? null,
    },
  });
}

/**
 * Prisma's `Json` column rejects `Date`, `BigInt`, and `Decimal` instances
 * directly. Snapshots produced by an earlier `findUnique` will contain these,
 * so we round-trip through JSON.stringify to turn them into ISO strings /
 * numbers / strings — the typical "give me a frozen view of this row" shape.
 */
function serializableSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ) as Prisma.InputJsonValue;
}
