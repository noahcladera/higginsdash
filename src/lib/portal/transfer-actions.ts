"use server";

/**
 * Portal-side: parent requests to move a paid enrollment to a
 * different class. Admin reviews + decides on the financial outcome
 * via `decideClassTransfer` (`src/lib/admin/transfer-actions.ts`).
 *
 * Validation:
 *   - the source enrollment belongs to the requester's household;
 *   - the source enrollment is `active` or `pending_payment` (we
 *     don't transfer waitlist or already-withdrawn rows);
 *   - the source enrollment hasn't had attendance recorded yet (no
 *     post-attendance transfers — that's a refund question);
 *   - the target series, if specified, is publicly visible and
 *     enrollable.
 *
 * The action returns the transfer-request id so the portal can deep
 * link the parent to a confirmation toast / page.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import { isGuardianOf } from "@/lib/portal/queries";
import { recordAudit } from "@/lib/audit";
import { notify, primaryEmailOf, getAdminRecipients } from "@/lib/notifications";

const RequestInput = z.object({
  fromEnrollmentId: z.string().uuid(),
  targetClassSeriesId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});

export type RequestTransferResult =
  | { ok: true; transferRequestId: string }
  | { ok: false; error: string };

export async function requestClassTransfer(
  input: z.input<typeof RequestInput>,
): Promise<RequestTransferResult> {
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid transfer request." };
  }
  const { fromEnrollmentId, targetClassSeriesId, note } = parsed.data;

  const { person } = await requireMember();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: fromEnrollmentId },
    select: {
      id: true,
      status: true,
      studentPersonId: true,
      classSeriesId: true,
      pricePaid: true,
      classSeries: {
        select: { id: true, name: true },
      },
      student: {
        select: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!enrollment) {
    return { ok: false, error: "We couldn't find that enrollment." };
  }

  const owns =
    enrollment.studentPersonId === person.id ||
    (await isGuardianOf(person.id, enrollment.studentPersonId));
  if (!owns) {
    return {
      ok: false,
      error: "You can only request a transfer for your family.",
    };
  }

  if (
    enrollment.status !== "active" &&
    enrollment.status !== "pending_payment"
  ) {
    return {
      ok: false,
      error: "Only active or pending enrollments can be transferred.",
    };
  }

  // No attendance yet — once a coach has marked the student present
  // we treat the seat as "consumed" and the transfer becomes a
  // partial-refund/credit conversation, not a swap.
  const attended = await prisma.attendance.count({
    where: {
      studentPersonId: enrollment.studentPersonId,
      classSession: { classSeriesId: enrollment.classSeriesId },
      status: { in: ["present", "late"] },
    },
  });
  if (attended > 0) {
    return {
      ok: false,
      error:
        "This enrollment already has attendance — contact the office for help.",
    };
  }

  // Refuse to stack open requests on the same enrollment.
  const existingPending = await prisma.classTransferRequest.findFirst({
    where: {
      fromEnrollmentId: enrollment.id,
      status: "pending",
    },
    select: { id: true },
  });
  if (existingPending) {
    return {
      ok: false,
      error: "You already have a pending transfer request for this class.",
    };
  }

  if (targetClassSeriesId) {
    const target = await prisma.classSeries.findUnique({
      where: { id: targetClassSeriesId },
      select: {
        id: true,
        status: true,
        visibility: true,
        archivedAt: true,
      },
    });
    if (!target) {
      return { ok: false, error: "That target class isn't available." };
    }
    if (
      target.archivedAt ||
      target.status !== "published" ||
      (target.visibility !== "public" && target.visibility !== "members_only")
    ) {
      return {
        ok: false,
        error: "That target class isn't open for transfers right now.",
      };
    }
    if (targetClassSeriesId === enrollment.classSeriesId) {
      return {
        ok: false,
        error: "Pick a different class than the one you're already in.",
      };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.classTransferRequest.create({
      data: {
        fromEnrollmentId: enrollment.id,
        requestedByPersonId: person.id,
        requestedTargetClassSeriesId: targetClassSeriesId ?? null,
        requestedNote: note ?? null,
        status: "pending",
      },
    });
    await recordAudit({
      tx,
      tableName: "class_transfer_requests",
      rowId: row.id,
      action: "insert",
      changedByPersonId: person.id,
      after: row,
    });
    return row;
  });

  // Tell every admin so the request shows up in their inbox / queue.
  const studentName = `${enrollment.student.person.firstName} ${enrollment.student.person.lastName}`.trim();
  const admins = await getAdminRecipients();
  await Promise.all(
    admins.map((a) =>
      notify({
        recipientPersonId: a.id,
        recipientEmail: a.primaryEmail,
        channels: a.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "transfer.requested.admin",
        subject: `Transfer request: ${studentName} from ${enrollment.classSeries.name}`,
        body:
          `${studentName} would like to transfer out of ${enrollment.classSeries.name}.\n\n` +
          (note ? `Note: ${note}\n\n` : "") +
          "Open the admin transfers queue to decide.",
        relatedTable: "class_transfer_requests",
        relatedRowId: created.id,
      }),
    ),
  );

  revalidatePath("/portal/classes");
  revalidatePath("/admin/transfers");
  revalidatePath("/admin/inbox");
  return { ok: true, transferRequestId: created.id };
}

const CancelInput = z.object({
  transferRequestId: z.string().uuid(),
});

export type CancelTransferResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Parent rescinds their own pending request before admin gets to it.
 */
export async function cancelClassTransfer(
  input: z.input<typeof CancelInput>,
): Promise<CancelTransferResult> {
  const parsed = CancelInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }
  const { person } = await requireMember();

  const row = await prisma.classTransferRequest.findUnique({
    where: { id: parsed.data.transferRequestId },
    select: {
      id: true,
      status: true,
      requestedByPersonId: true,
      fromEnrollment: {
        select: { studentPersonId: true },
      },
    },
  });
  if (!row) return { ok: false, error: "Request not found." };
  if (row.status !== "pending") {
    return { ok: false, error: "This request can no longer be cancelled." };
  }

  const owns =
    row.requestedByPersonId === person.id ||
    row.fromEnrollment.studentPersonId === person.id ||
    (await isGuardianOf(person.id, row.fromEnrollment.studentPersonId));
  if (!owns) {
    return { ok: false, error: "You can only cancel your own request." };
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.classTransferRequest.update({
      where: { id: row.id },
      data: { status: "cancelled" },
    });
    await recordAudit({
      tx,
      tableName: "class_transfer_requests",
      rowId: row.id,
      action: "update",
      changedByPersonId: person.id,
      before: row,
      after: updated,
    });
  });

  revalidatePath("/portal/classes");
  revalidatePath("/admin/transfers");
  return { ok: true };
}
