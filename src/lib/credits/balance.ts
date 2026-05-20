/**
 * Read helpers for the household credit ledger.
 *
 * Balance is the sum of every `HouseholdCredit.amountCents` row for a
 * household: positive rows credit the wallet (transfer surplus, refund-
 * as-credit, manual admin adjustment); negative rows debit it
 * (`enrollment_payment` against a paid lesson seat). The ledger is
 * append-only — we never edit history.
 *
 * Lessons-only by policy: a `enrollment_payment` debit must reference
 * an `Enrollment` (CHECK constraint
 * `household_credits_spend_signs`), and the spend helper in
 * `./spend.ts` refuses to write a debit that doesn't.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CreditLedgerEntry {
  id: string;
  amountCents: number;
  reason:
    | "transfer_remainder"
    | "withdrawal_refund"
    | "admin_adjustment"
    | "enrollment_payment";
  relatedEnrollmentId: string | null;
  relatedPaymentId: string | null;
  relatedTransferId: string | null;
  note: string | null;
  createdAt: Date;
  createdByPersonId: string;
}

/**
 * Current household balance in EUR cents. Negative balances are
 * possible in principle (admin clawback) but are never created by the
 * spend helper.
 */
export async function getHouseholdCreditBalanceCents(
  householdId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const result = await client.householdCredit.aggregate({
    where: { householdId },
    _sum: { amountCents: true },
  });
  return result._sum.amountCents ?? 0;
}

/** Convenience wrapper expressing the balance in whole euros (rounded). */
export async function getHouseholdCreditBalanceEur(
  householdId: string,
): Promise<number> {
  const cents = await getHouseholdCreditBalanceCents(householdId);
  return cents / 100;
}

/**
 * Latest N ledger rows for a household, newest first. Used by the
 * portal credits page and the admin household drawer.
 */
export async function getHouseholdCreditLedger(
  householdId: string,
  limit = 100,
): Promise<CreditLedgerEntry[]> {
  const rows = await prisma.householdCredit.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amountCents,
    reason: r.reason,
    relatedEnrollmentId: r.relatedEnrollmentId,
    relatedPaymentId: r.relatedPaymentId,
    relatedTransferId: r.relatedTransferId,
    note: r.note,
    createdAt: r.createdAt,
    createdByPersonId: r.createdByPersonId,
  }));
}

export { formatCreditAmount } from "./format";
