"use server";

/**
 * Manual refund recording (issue #2 family — phase 7).
 *
 * The Mollie integration isn't live yet, so refunds are entered by hand
 * by the office:
 *
 *   - `recordRefund` inserts a `Refund` row against an existing Payment.
 *     If the cumulative refunded amount equals or exceeds the payment
 *     amount, we flip `Payment.status` to `refunded` and stamp
 *     `refundedAt`. Partial refunds leave the row at `paid`.
 *
 *   - We notify the household payer + primary contact, and audit.
 *
 *   - When a refund is recorded against a payment line whose enrollment
 *     or membership had `refundRequestedAt` set, we clear that flag so
 *     the row drops off the "needs refund" review queue.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { notify, primaryEmailOf } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

export type ActionResult =
  | { ok: true; refundId: string }
  | { ok: false; error: string };

const RefundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive().multipleOf(0.01),
  reason: z.string().trim().min(5).max(2000),
  notes: z.string().trim().max(2000).optional(),
});

export async function recordRefund(
  input: z.input<typeof RefundSchema>,
): Promise<ActionResult> {
  const parsed = RefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid refund details." };
  }
  const { paymentId, amount, reason, notes } = parsed.data;
  const { person: admin } = await requireAdmin();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      refunds: { select: { amount: true } },
      lines: {
        select: {
          enrollmentId: true,
          membershipId: true,
        },
      },
      paidByPerson: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          emails: {
            where: { isPrimary: true, archivedAt: null },
            select: { address: true, isPrimary: true },
            take: 1,
          },
        },
      },
      paidByHousehold: {
        select: {
          primaryContact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              emails: {
                where: { isPrimary: true, archivedAt: null },
                select: { address: true, isPrimary: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!payment) return { ok: false, error: "Payment not found." };
  if (payment.status === "refunded") {
    return {
      ok: false,
      error: "This payment is already fully refunded.",
    };
  }

  const alreadyRefunded = payment.refunds.reduce(
    (acc, r) => acc + Number(r.amount),
    0,
  );
  const paymentAmount = Number(payment.amount);
  if (alreadyRefunded + amount > paymentAmount + 0.001) {
    return {
      ok: false,
      error: `Total refunds would exceed the payment amount (€${paymentAmount.toFixed(
        2,
      )}). Already refunded: €${alreadyRefunded.toFixed(2)}.`,
    };
  }

  const fullyRefunded =
    alreadyRefunded + amount >= paymentAmount - 0.001;

  const enrollmentIds = [
    ...new Set(payment.lines.map((l) => l.enrollmentId).filter(Boolean) as string[]),
  ];
  const membershipIds = [
    ...new Set(payment.lines.map((l) => l.membershipId).filter(Boolean) as string[]),
  ];

  const beforeSnapshot = payment;

  const refundId = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        paymentId,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        currency: payment.currency,
        reason,
        notes: notes ?? null,
        processedByPersonId: admin.id,
      },
    });

    if (fullyRefunded) {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "refunded",
          refundedAt: new Date(),
        },
      });
    }

    if (enrollmentIds.length > 0) {
      await tx.enrollment.updateMany({
        where: { id: { in: enrollmentIds } },
        data: {
          refundRequestedAt: null,
          refundRequestedReason: null,
        },
      });
    }
    if (membershipIds.length > 0) {
      await tx.membership.updateMany({
        where: { id: { in: membershipIds } },
        data: { refundRequestedAt: null },
      });
    }

    await recordAudit({
      tx,
      tableName: "refunds",
      rowId: refund.id,
      action: "insert",
      changedByPersonId: admin.id,
      after: refund,
      changeSource: "admin_console",
    });
    await recordAudit({
      tx,
      tableName: "payments",
      rowId: paymentId,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSnapshot,
      after: { refundedAt: fullyRefunded ? new Date().toISOString() : null },
      changeSource: "admin_console",
    });

    return refund.id;
  });

  // Notify the payer + household primary contact (deduplicated).
  const recipients = new Map<
    string,
    { id: string; primaryEmail: string | null }
  >();
  recipients.set(payment.paidByPerson.id, {
    id: payment.paidByPerson.id,
    primaryEmail: primaryEmailOf(payment.paidByPerson),
  });
  if (payment.paidByHousehold?.primaryContact) {
    recipients.set(payment.paidByHousehold.primaryContact.id, {
      id: payment.paidByHousehold.primaryContact.id,
      primaryEmail: primaryEmailOf(payment.paidByHousehold.primaryContact),
    });
  }

  await Promise.all(
    [...recipients.values()].map((r) =>
      notify({
        recipientPersonId: r.id,
        recipientEmail: r.primaryEmail,
        channels: r.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: fullyRefunded
          ? "refund.processed.full"
          : "refund.processed.partial",
        subject: `Refund of €${amount.toFixed(2)} processed`,
        body:
          `We've recorded a refund of €${amount.toFixed(2)} against "${payment.description}".\n\n` +
          `Reason: ${reason}\n\n` +
          (fullyRefunded
            ? "This fully refunds that payment."
            : `Remaining paid: €${(paymentAmount - alreadyRefunded - amount).toFixed(2)}.`),
        relatedTable: "payments",
        relatedRowId: paymentId,
      }),
    ),
  );

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
  revalidatePath("/admin/inbox");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/inbox");
  return { ok: true, refundId };
}
