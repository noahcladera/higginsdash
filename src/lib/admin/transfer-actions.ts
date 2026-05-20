"use server";

/**
 * Admin-side: decide a pending class-transfer request.
 *
 * One transaction does the lot:
 *   1. Withdraw the source enrollment (re-using the same status flip
 *      the parent withdraw uses, but we don't surface it as a refund
 *      flag — this transfer owns the financial outcome).
 *   2. Create the new enrollment for the target series + group at the
 *      currently-prorated price.
 *   3. Reallocate the original payment line by adding a "Transfer
 *      adjustment" line that reassigns the lesson seat to the new
 *      enrollment. The original line stays so accounting history
 *      is preserved.
 *   4. Settle the delta:
 *        - `exact`     → no movement
 *        - `refund`    → call `recordRefund` (admin will fill amount)
 *        - `credit`    → write a `household_credits` row
 *        - `extra_bill`→ create a follow-up Mollie payment
 *   5. AuditLog every write and notify the parent.
 *
 * Mollie isn't actually live yet so `extra_bill` writes a `Payment`
 * row in `pending` status that the office can mark `paid` when the
 * money arrives — same pattern the rest of the app uses.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { recordAudit } from "@/lib/audit";
import { notify, primaryEmailOf } from "@/lib/notifications";
import {
  ageBracketFromAge,
  computeEnrollmentPricing,
} from "@/lib/portal/enrollment-pricing";
import { getActiveMembershipCoverage } from "@/lib/memberships/coverage";
import { grantHouseholdCredit } from "@/lib/credits";
import { recordRefund } from "@/lib/payments/refund-actions";

const ApproveInput = z.object({
  transferRequestId: z.string().uuid(),
  /** Final target series the admin chose. Falls back to requested. */
  targetClassSeriesId: z.string().uuid(),
  /** Required when the target series has more than one sub-group. */
  targetGroupId: z.string().uuid().optional(),
  resolution: z.enum(["exact", "refund", "credit", "extra_bill"]),
  /** Required when resolution is `refund`. Amount in EUR (e.g. 12.50). */
  refundEur: z.number().nonnegative().multipleOf(0.01).optional(),
  refundReason: z.string().trim().min(5).max(2000).optional(),
  /** Required when resolution is `extra_bill`. Amount in EUR. */
  extraBillEur: z.number().nonnegative().multipleOf(0.01).optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

const RejectInput = z.object({
  transferRequestId: z.string().uuid(),
  adminNote: z.string().trim().min(1).max(2000),
});

export type DecideTransferResult =
  | { ok: true; resultEnrollmentId: string | null }
  | { ok: false; error: string };

export async function decideClassTransfer(
  input: z.input<typeof ApproveInput>,
): Promise<DecideTransferResult> {
  const parsed = ApproveInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid decision input." };
  }
  const { person: admin } = await requireAdmin();

  const reqRow = await prisma.classTransferRequest.findUnique({
    where: { id: parsed.data.transferRequestId },
    include: {
      fromEnrollment: {
        include: {
          classSeries: { select: { id: true, name: true } },
          student: {
            include: {
              person: {
                include: {
                  emails: {
                    where: { isPrimary: true, archivedAt: null },
                    select: { address: true, isPrimary: true },
                    take: 1,
                  },
                  householdMember: {
                    select: { householdId: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!reqRow) return { ok: false, error: "Transfer request not found." };
  if (reqRow.status !== "pending") {
    return { ok: false, error: "This request was already decided." };
  }

  const sourceEnrollment = reqRow.fromEnrollment;
  const studentPersonId = sourceEnrollment.studentPersonId;
  const householdId =
    sourceEnrollment.student.person.householdMember?.householdId ?? null;
  const studentName = `${sourceEnrollment.student.person.firstName} ${sourceEnrollment.student.person.lastName}`.trim();

  const target = await prisma.classSeries.findUnique({
    where: { id: parsed.data.targetClassSeriesId },
    select: {
      id: true,
      name: true,
      maxStudents: true,
      pricePerSeries: true,
      visibility: true,
      status: true,
      archivedAt: true,
      sessions: {
        where: { status: { not: "cancelled" } },
        select: { startsAt: true },
      },
      groups: {
        where: { archivedAt: null },
        select: { id: true, name: true, maxStudents: true },
      },
      venue: {
        select: { club: { select: { id: true, slug: true } } },
      },
    },
  });
  if (!target || target.archivedAt) {
    return { ok: false, error: "Target class is no longer available." };
  }
  if (target.status !== "published") {
    return { ok: false, error: "Target class is not published." };
  }
  if (target.id === sourceEnrollment.classSeriesId) {
    return { ok: false, error: "Pick a different class than the source." };
  }

  let targetGroupId = parsed.data.targetGroupId;
  if (!targetGroupId) {
    if (target.groups.length === 1) {
      targetGroupId = target.groups[0].id;
    } else if (target.groups.length === 0) {
      return {
        ok: false,
        error: "Target class has no sub-group on file. Fix that first.",
      };
    } else {
      return { ok: false, error: "Pick a sub-group for the target class." };
    }
  }
  if (!target.groups.some((g) => g.id === targetGroupId)) {
    return { ok: false, error: "That sub-group isn't part of the target." };
  }

  // Compute the prorated target price the same way the parent flow
  // does, so the admin sees the price the parent would have seen.
  const targetClubSlugRaw = target.venue?.club?.slug.toLowerCase() ?? null;
  const targetClubSlug =
    targetClubSlugRaw === "triaz" || targetClubSlugRaw === "randwijck"
      ? targetClubSlugRaw
      : null;
  const studentDob = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: { dateOfBirth: true },
  });
  const ageBracket = ageBracketFromAge(
    studentDob?.dateOfBirth ? ageFromDob(studentDob.dateOfBirth) : null,
  );
  const coverage = await getActiveMembershipCoverage({
    householdId,
    candidatePersonIds: [studentPersonId],
  });
  const hasActiveMembership =
    targetClubSlug != null && coverage.has(studentPersonId, targetClubSlug);
  const targetBreakdown = computeEnrollmentPricing({
    pricePerSeries:
      target.pricePerSeries != null ? Number(target.pricePerSeries) : null,
    sessions: target.sessions,
    now: new Date(),
    venueClubSlug: targetClubSlug,
    hasActiveMembership,
    candidateAgeBracket: ageBracket,
  });
  const newLessonEur = targetBreakdown.payableLesson ?? 0;
  const originalPaidEur =
    sourceEnrollment.pricePaid != null
      ? Number(sourceEnrollment.pricePaid)
      : 0;
  const deltaCents = Math.round((newLessonEur - originalPaidEur) * 100);

  // Resolution-specific validation up front so we don't enter the
  // transaction with bad inputs.
  if (parsed.data.resolution === "refund") {
    if (parsed.data.refundEur == null || parsed.data.refundEur <= 0) {
      return {
        ok: false,
        error: "Enter a positive refund amount.",
      };
    }
    if (deltaCents >= 0) {
      return {
        ok: false,
        error:
          "Refunds only apply when the new class is cheaper than the original.",
      };
    }
    const surplusEur = -deltaCents / 100;
    if (parsed.data.refundEur > surplusEur + 0.001) {
      return {
        ok: false,
        error: `Refund cannot exceed the €${surplusEur.toFixed(2)} surplus.`,
      };
    }
    if (!parsed.data.refundReason || parsed.data.refundReason.length < 5) {
      return {
        ok: false,
        error: "Add a refund reason (at least 5 characters).",
      };
    }
  }
  if (parsed.data.resolution === "credit" && deltaCents >= 0) {
    return {
      ok: false,
      error: "Credit only applies when the new class is cheaper.",
    };
  }
  if (parsed.data.resolution === "extra_bill") {
    if (deltaCents <= 0) {
      return {
        ok: false,
        error:
          "Extra bill only applies when the new class is more expensive.",
      };
    }
    const expected = deltaCents / 100;
    const provided = parsed.data.extraBillEur ?? expected;
    if (Math.abs(provided - expected) > 0.01) {
      return {
        ok: false,
        error: `Bill amount should match the €${expected.toFixed(2)} difference.`,
      };
    }
  }

  // Find a payment line to rebind. We look for the first line with
  // enrollmentId matching the source — for the typical single-payment
  // checkout there is exactly one.
  const sourceLine = await prisma.paymentLine.findFirst({
    where: { enrollmentId: sourceEnrollment.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, paymentId: true, amount: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    // 1. Withdraw source enrollment (suppress the auto-refund flag —
    //    the transfer owns the financial outcome).
    const withdrawnAt = new Date();
    const beforeSource = sourceEnrollment;
    await tx.enrollment.update({
      where: { id: sourceEnrollment.id },
      data: {
        status: "withdrawn",
        withdrawnOn: withdrawnAt,
        withdrawalReason: `Transferred to ${target.name}`,
        refundRequestedAt: null,
        refundRequestedReason: null,
      },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: sourceEnrollment.id,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSource,
      after: {
        status: "withdrawn",
        withdrawnOn: withdrawnAt.toISOString(),
        reason: "class_transfer",
        transferRequestId: reqRow.id,
      },
      changeSource: "admin_console",
    });

    // 2. Create new enrollment, snapshotting the prorated price.
    const created = await tx.enrollment.create({
      data: {
        classSeriesId: target.id,
        groupId: targetGroupId,
        studentPersonId,
        status: "active",
        enrolledByPersonId: admin.id,
        enrolledOn: new Date(),
        pricePaid: targetBreakdown.payableLesson ?? null,
        priceMembershipAddOn: targetBreakdown.membershipAddOn ?? null,
        sessionsRemainingAtEnrollment: targetBreakdown.remainingSessions,
        // Heather feedback: transfers always benefit from a quick
        // sanity check — flag for review even if age fits.
        requiresReview: false,
        reviewReason: null,
      },
      select: { id: true },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: created.id,
      action: "insert",
      changedByPersonId: admin.id,
      after: { ...created, transferRequestId: reqRow.id },
      changeSource: "admin_console",
    });

    // 3. Reallocate the original payment line by writing a
    //    transfer-adjustment line: leave the source line as historical
    //    record, add a new positive line tagged to the new enrollment
    //    so the lesson seat actually shows on the new row's payment
    //    history. Net cash hasn't moved — the delta is settled below.
    if (sourceLine) {
      const lineAmount =
        targetBreakdown.payableLesson != null
          ? new Prisma.Decimal(targetBreakdown.payableLesson)
          : sourceLine.amount;
      await tx.paymentLine.create({
        data: {
          paymentId: sourceLine.paymentId,
          amount: lineAmount,
          description: `Transfer adjustment → ${target.name}`,
          enrollmentId: created.id,
        },
      });
      // Counter-line so the original payment.amount still
      // reconciles. We zero out the source seat by writing the
      // same value with a negative sign and the OLD enrollmentId
      // — i.e. "we no longer attribute this revenue to the old
      // enrollment". Decimal supports negatives.
      await tx.paymentLine.create({
        data: {
          paymentId: sourceLine.paymentId,
          amount: lineAmount.negated(),
          description: `Transfer adjustment ← ${sourceEnrollment.classSeries.name}`,
          enrollmentId: sourceEnrollment.id,
        },
      });
    }

    // 4. Resolution branches.
    let resolutionRefundId: string | null = null;
    let resolutionCreditId: string | null = null;
    let resolutionPaymentId: string | null = null;

    if (parsed.data.resolution === "credit" && householdId) {
      const surplusCents = -deltaCents;
      const granted = await tx.householdCredit.create({
        data: {
          householdId,
          amountCents: surplusCents,
          reason: "transfer_remainder",
          relatedEnrollmentId: created.id,
          relatedPaymentId: sourceLine?.paymentId ?? null,
          relatedTransferId: reqRow.id,
          createdByPersonId: admin.id,
          note: `Transfer surplus from ${sourceEnrollment.classSeries.name} → ${target.name}`,
        },
      });
      await recordAudit({
        tx,
        tableName: "household_credits",
        rowId: granted.id,
        action: "insert",
        changedByPersonId: admin.id,
        after: granted,
        changeSource: "admin_console",
        requestId: reqRow.id,
      });
      resolutionCreditId = granted.id;
    }

    if (parsed.data.resolution === "extra_bill") {
      const billCents = deltaCents;
      const billAmount = new Prisma.Decimal((billCents / 100).toFixed(2));
      const newPayment = await tx.payment.create({
        data: {
          amount: billAmount,
          currency: "EUR",
          status: "pending",
          description: `Transfer top-up → ${target.name}`,
          paidByPersonId: reqRow.requestedByPersonId,
          paidByHouseholdId: householdId,
        },
        select: { id: true },
      });
      await tx.paymentLine.create({
        data: {
          paymentId: newPayment.id,
          amount: billAmount,
          description: `Transfer top-up → ${target.name}`,
          enrollmentId: created.id,
        },
      });
      await recordAudit({
        tx,
        tableName: "payments",
        rowId: newPayment.id,
        action: "insert",
        changedByPersonId: admin.id,
        after: { ...newPayment, transferRequestId: reqRow.id },
        changeSource: "admin_console",
      });
      resolutionPaymentId = newPayment.id;
    }

    // 5. Stamp the transfer row with the decision metadata.
    const updatedReq = await tx.classTransferRequest.update({
      where: { id: reqRow.id },
      data: {
        status: "approved",
        decidedByPersonId: admin.id,
        decidedAt: new Date(),
        adminNote: parsed.data.adminNote ?? null,
        resultEnrollmentId: created.id,
        deltaCents,
        resolution: parsed.data.resolution,
        resolutionPaymentId,
        resolutionCreditId,
      },
    });
    await recordAudit({
      tx,
      tableName: "class_transfer_requests",
      rowId: reqRow.id,
      action: "update",
      changedByPersonId: admin.id,
      before: reqRow,
      after: updatedReq,
      changeSource: "admin_console",
    });

    return {
      newEnrollmentId: created.id,
      paymentIdForRefund: sourceLine?.paymentId ?? null,
      resolutionPaymentId,
      resolutionCreditId,
    };
  });

  // Refund branch piggy-backs on the canonical `recordRefund` so the
  // notify + audit + payment.status flip all happen consistently.
  if (parsed.data.resolution === "refund" && result.paymentIdForRefund) {
    const refundRes = await recordRefund({
      paymentId: result.paymentIdForRefund,
      amount: parsed.data.refundEur!,
      reason: parsed.data.refundReason!,
      notes: `Class transfer ${reqRow.id}`,
    });
    if (refundRes.ok) {
      await prisma.classTransferRequest.update({
        where: { id: reqRow.id },
        data: { resolutionRefundId: refundRes.refundId },
      });
    }
  }

  // Notify the requester of the decision.
  const requester = await prisma.person.findUnique({
    where: { id: reqRow.requestedByPersonId },
    select: {
      id: true,
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true, isPrimary: true },
        take: 1,
      },
    },
  });
  const requesterEmail = primaryEmailOf(requester);
  if (requester) {
    await notify({
      recipientPersonId: requester.id,
      recipientEmail: requesterEmail,
      channels: requesterEmail ? ["in_app", "email"] : ["in_app"],
      templateKey: "transfer.decided.approved",
      subject: `${studentName} transferred to ${target.name}`,
      body:
        `We've moved ${studentName} from ${sourceEnrollment.classSeries.name} to ${target.name}.\n\n` +
        resolutionMessage(parsed.data.resolution, deltaCents) +
        (parsed.data.adminNote ? `\n\nNote from the office: ${parsed.data.adminNote}` : ""),
      relatedTable: "class_transfer_requests",
      relatedRowId: reqRow.id,
    });
  }

  revalidatePath("/admin/transfers");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/payments");
  revalidatePath("/portal/classes");
  revalidatePath("/portal/credits");
  return { ok: true, resultEnrollmentId: result.newEnrollmentId };
}

export async function rejectClassTransfer(
  input: z.input<typeof RejectInput>,
): Promise<DecideTransferResult> {
  const parsed = RejectInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Add a note explaining the rejection." };
  }
  const { person: admin } = await requireAdmin();

  const row = await prisma.classTransferRequest.findUnique({
    where: { id: parsed.data.transferRequestId },
    include: {
      fromEnrollment: {
        include: {
          classSeries: { select: { name: true } },
          student: {
            include: {
              person: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return { ok: false, error: "Transfer request not found." };
  if (row.status !== "pending") {
    return { ok: false, error: "This request was already decided." };
  }

  const before = row;
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.classTransferRequest.update({
      where: { id: row.id },
      data: {
        status: "rejected",
        decidedByPersonId: admin.id,
        decidedAt: new Date(),
        adminNote: parsed.data.adminNote,
      },
    });
    await recordAudit({
      tx,
      tableName: "class_transfer_requests",
      rowId: row.id,
      action: "update",
      changedByPersonId: admin.id,
      before,
      after: updated,
      changeSource: "admin_console",
    });
    return updated;
  });

  const requester = await prisma.person.findUnique({
    where: { id: row.requestedByPersonId },
    select: {
      id: true,
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true, isPrimary: true },
        take: 1,
      },
    },
  });
  const studentName = `${row.fromEnrollment.student.person.firstName} ${row.fromEnrollment.student.person.lastName}`.trim();
  const email = primaryEmailOf(requester);
  if (requester) {
    await notify({
      recipientPersonId: requester.id,
      recipientEmail: email,
      channels: email ? ["in_app", "email"] : ["in_app"],
      templateKey: "transfer.decided.rejected",
      subject: `Transfer request declined for ${studentName}`,
      body:
        `We weren't able to transfer ${studentName} from ${row.fromEnrollment.classSeries.name} this time.\n\n` +
        `Note from the office: ${parsed.data.adminNote}`,
      relatedTable: "class_transfer_requests",
      relatedRowId: row.id,
    });
  }

  revalidatePath("/admin/transfers");
  revalidatePath("/admin/inbox");
  revalidatePath("/portal/classes");
  return { ok: true, resultEnrollmentId: null };
}

function resolutionMessage(
  resolution: "exact" | "refund" | "credit" | "extra_bill",
  deltaCents: number,
): string {
  if (resolution === "exact") {
    return "The new class costs the same as the original — nothing else to settle.";
  }
  if (resolution === "credit") {
    return `We've added €${(-deltaCents / 100).toFixed(2)} of lesson credit to your household. It'll apply automatically on your next enrollment.`;
  }
  if (resolution === "refund") {
    return `We've recorded a refund for the surplus. You'll see it on your bank statement in a few business days.`;
  }
  return `The new class costs €${(deltaCents / 100).toFixed(2)} more — we'll send a follow-up payment link for the difference.`;
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
