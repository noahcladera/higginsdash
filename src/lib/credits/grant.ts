/**
 * Issue household credit (positive ledger entry).
 *
 * Wraps the `HouseholdCredit` insert with our standard audit-log
 * record. Pass a `tx` to bind the write to an outer transaction so the
 * ledger row commits atomically with the surrounding business write
 * (e.g. when a class transfer is approved and the surplus becomes
 * credit, both rows must commit together).
 *
 * Lessons-only constraint is enforced at the DB level by the
 * `household_credits_spend_signs` CHECK and at write time by this
 * function: only positive amounts are accepted; for spending see
 * `./spend.ts` instead.
 */

import type { Prisma, HouseholdCreditReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export type IssuableCreditReason = Exclude<
  HouseholdCreditReason,
  "enrollment_payment"
>;

export interface GrantCreditInput {
  householdId: string;
  amountCents: number;
  reason: IssuableCreditReason;
  createdByPersonId: string;
  note?: string | null;
  relatedEnrollmentId?: string | null;
  relatedPaymentId?: string | null;
  relatedTransferId?: string | null;
}

export interface GrantCreditResult {
  creditId: string;
  amountCents: number;
}

export async function grantHouseholdCredit(
  input: GrantCreditInput,
  tx?: Prisma.TransactionClient,
): Promise<GrantCreditResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(
      "grantHouseholdCredit: amountCents must be a positive integer (EUR cents).",
    );
  }
  if (input.reason === ("enrollment_payment" as HouseholdCreditReason)) {
    throw new Error(
      "grantHouseholdCredit: use spendHouseholdCredit for enrollment_payment rows.",
    );
  }

  const run = async (client: Prisma.TransactionClient) => {
    const row = await client.householdCredit.create({
      data: {
        householdId: input.householdId,
        amountCents: input.amountCents,
        reason: input.reason,
        createdByPersonId: input.createdByPersonId,
        note: input.note ?? null,
        relatedEnrollmentId: input.relatedEnrollmentId ?? null,
        relatedPaymentId: input.relatedPaymentId ?? null,
        relatedTransferId: input.relatedTransferId ?? null,
      },
    });
    await recordAudit({
      tx: client,
      tableName: "household_credits",
      rowId: row.id,
      action: "insert",
      changedByPersonId: input.createdByPersonId,
      after: row,
      changeSource: "admin_console",
    });
    return { creditId: row.id, amountCents: row.amountCents };
  };

  if (tx) return run(tx);
  return prisma.$transaction(run);
}
