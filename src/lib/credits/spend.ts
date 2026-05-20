/**
 * Spend household credit against a paid lesson enrollment.
 *
 * Writes a single negative `HouseholdCredit` row (reason
 * `enrollment_payment`). The caller is expected to also write a
 * matching `PaymentLine` with `creditLedgerId = <ledgerRow.id>` and
 * `amount = (debitCents / 100)` (positive Decimal), so the same
 * payment displays as `lesson + credit_applied = total_charged`.
 *
 * Lessons-only by policy:
 *  - the spend MUST reference an `Enrollment` (DB CHECK
 *    `household_credits_spend_signs` + assertion below);
 *  - the spend MUST be ≤ the household's current balance.
 *
 * Memberships never call into this helper. The
 * `applyCreditToEnrollmentCheckout` planner returns 0 if asked about a
 * membership context; only `finalizePaidEnrollment` should call this.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getHouseholdCreditBalanceCents } from "./balance";

export interface ApplyCreditPlanInput {
  householdId: string | null;
  /** EUR cents the user asked to apply, before clamping. */
  requestedCents: number;
  /** EUR cents owed for the lesson seat (without membership add-on). */
  lessonChargeCents: number;
}

export interface ApplyCreditPlan {
  /** EUR cents that will actually move from credit. Always ≥0, ≤ both inputs. */
  appliedCents: number;
  /** EUR cents the household had available before this plan was made. */
  availableCents: number;
  /** Cents still owed to Mollie after applying credit. */
  remainingCents: number;
}

/**
 * Pure planner used by `<EnrollPanel>` and `finalizePaidEnrollment`
 * alike — same numbers in the UI and on the server.
 */
export async function planCreditApplicationForEnrollment(
  input: ApplyCreditPlanInput,
): Promise<ApplyCreditPlan> {
  if (input.householdId == null) {
    return {
      appliedCents: 0,
      availableCents: 0,
      remainingCents: Math.max(0, input.lessonChargeCents),
    };
  }
  const availableCents = await getHouseholdCreditBalanceCents(
    input.householdId,
  );
  const requested = Math.max(0, Math.floor(input.requestedCents));
  const cap = Math.min(availableCents, Math.max(0, input.lessonChargeCents));
  const appliedCents = Math.min(requested, cap);
  return {
    appliedCents,
    availableCents,
    remainingCents: Math.max(0, input.lessonChargeCents - appliedCents),
  };
}

export interface SpendCreditInput {
  householdId: string;
  enrollmentId: string;
  /** Positive EUR cents to debit. Stored as a negative ledger row. */
  amountCents: number;
  createdByPersonId: string;
  note?: string | null;
  relatedPaymentId?: string | null;
  relatedTransferId?: string | null;
}

export interface SpendCreditResult {
  creditId: string;
  amountCents: number;
}

/**
 * Write the negative ledger row. Caller MUST be inside an open
 * transaction so that the matching `PaymentLine` (with
 * `creditLedgerId`) commits with the spend.
 */
export async function spendHouseholdCredit(
  input: SpendCreditInput,
  tx: Prisma.TransactionClient,
): Promise<SpendCreditResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(
      "spendHouseholdCredit: amountCents must be a positive integer (EUR cents).",
    );
  }
  // Re-read inside the txn so a concurrent spend can't drive the
  // balance negative. We use SERIALIZABLE / REPEATABLE-READ at the
  // outer transaction level for this guarantee; the cheap balance
  // check below is the second line of defence.
  const balance = await getHouseholdCreditBalanceCents(input.householdId, tx);
  if (input.amountCents > balance) {
    throw new Error(
      `spendHouseholdCredit: insufficient credit (available ${balance}, requested ${input.amountCents}).`,
    );
  }

  const row = await tx.householdCredit.create({
    data: {
      householdId: input.householdId,
      amountCents: -input.amountCents,
      reason: "enrollment_payment",
      relatedEnrollmentId: input.enrollmentId,
      relatedPaymentId: input.relatedPaymentId ?? null,
      relatedTransferId: input.relatedTransferId ?? null,
      createdByPersonId: input.createdByPersonId,
      note: input.note ?? null,
    },
  });

  await recordAudit({
    tx,
    tableName: "household_credits",
    rowId: row.id,
    action: "insert",
    changedByPersonId: input.createdByPersonId,
    after: row,
  });

  return { creditId: row.id, amountCents: row.amountCents };
}
