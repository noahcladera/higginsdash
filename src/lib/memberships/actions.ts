"use server";

/**
 * Membership cancellation workflow (issue #2 family — phase 6).
 *
 *   - `requestMembershipCancellation` → household member raises a request.
 *     The membership row stays at `status='active'` (so EXCLUDE / coverage
 *     checks behave the same) but gets `cancellation_requested_at` stamped.
 *   - `denyMembershipCancellation`    → office decides not to cancel; we
 *     clear the stamps and notify the requester.
 *   - `approveMembershipCancellation` → office flips the row to
 *     `status='cancelled'` and (optionally) flags a refund for `/admin/payments`.
 *
 * Notifications + audit go through the shared helpers so this surface
 * lights up the inboxes the same way booking & class flows do.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  notify,
  getAdminRecipients,
  primaryEmailOf,
} from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const RequestSchema = z.object({
  membershipId: z.string().uuid(),
  reason: z.string().trim().min(5).max(2000),
});

const DenySchema = z.object({
  membershipId: z.string().uuid(),
  denialReason: z.string().trim().min(5).max(2000),
});

const ApproveSchema = z.object({
  membershipId: z.string().uuid(),
  flagRefund: z.boolean().optional().default(false),
  adminNote: z.string().trim().max(2000).optional(),
});

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function revalidateAll() {
  revalidatePath("/portal/membership");
  revalidatePath("/portal/inbox");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/memberships/cancellations");
}

// ---------------------------------------------------------------------------
// requestMembershipCancellation — household member files the ticket
// ---------------------------------------------------------------------------

export async function requestMembershipCancellation(
  input: z.input<typeof RequestSchema>,
): Promise<ActionResult> {
  const parsed = RequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Tell the office why in at least 5 characters.",
    };
  }
  const { membershipId, reason } = parsed.data;

  const { person, householdId } = await requireMember();

  if (!householdId) {
    return { ok: false, error: "Your account isn't linked to a household." };
  }

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!membership) return { ok: false, error: "Membership not found." };
  if (membership.householdId !== householdId) {
    return { ok: false, error: "You can only cancel your own household's membership." };
  }
  if (membership.status !== "active") {
    return {
      ok: false,
      error: "This membership isn't currently active.",
    };
  }
  if (membership.cancellationRequestedAt) {
    return {
      ok: false,
      error: "A cancellation request is already pending on this membership.",
    };
  }

  const beforeSnapshot = membership;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: {
        cancellationRequestedAt: new Date(),
        cancellationRequestedReason: reason,
        cancellationRequestedByPersonId: person.id,
        cancellationDenialReason: null,
      },
    });
    await recordAudit({
      tx,
      tableName: "memberships",
      rowId: membershipId,
      action: "update",
      changedByPersonId: person.id,
      before: beforeSnapshot,
      after: updated,
    });
  });

  const admins = await getAdminRecipients();
  const requesterName = `${person.firstName} ${person.lastName}`.trim();
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipientPersonId: admin.id,
        recipientEmail: admin.primaryEmail,
        channels: admin.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "membership.cancellation.requested",
        subject: `Cancellation request from ${requesterName}`,
        body:
          `${requesterName} asked to cancel their household membership ` +
          `(active until ${fmtDate(membership.expiresOn)}).\n\nReason: ${reason}`,
        relatedTable: "memberships",
        relatedRowId: membershipId,
      }),
    ),
  );

  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// denyMembershipCancellation — office talks them off the ledge
// ---------------------------------------------------------------------------

export async function denyMembershipCancellation(
  input: z.input<typeof DenySchema>,
): Promise<ActionResult> {
  const parsed = DenySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Give a denial reason of at least 5 characters." };
  }
  const { membershipId, denialReason } = parsed.data;
  const { person: admin } = await requireAdmin();

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      cancellationRequester: {
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
  });
  if (!membership) return { ok: false, error: "Membership not found." };
  if (!membership.cancellationRequestedAt) {
    return { ok: false, error: "There's no pending cancellation to deny." };
  }

  const beforeSnapshot = membership;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: {
        cancellationRequestedAt: null,
        cancellationRequestedReason: null,
        cancellationRequestedByPersonId: null,
        cancellationDenialReason: denialReason,
      },
    });
    await recordAudit({
      tx,
      tableName: "memberships",
      rowId: membershipId,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSnapshot,
      after: updated,
      changeSource: "admin_console",
    });
  });

  if (membership.cancellationRequester) {
    await notify({
      recipientPersonId: membership.cancellationRequester.id,
      recipientEmail: primaryEmailOf(membership.cancellationRequester),
      channels: primaryEmailOf(membership.cancellationRequester)
        ? ["in_app", "email"]
        : ["in_app"],
      templateKey: "membership.cancellation.denied",
      subject: "About your cancellation request",
      body:
        `We've reviewed your cancellation request and can't go ahead with it.\n\n` +
        `Office note: ${denialReason}\n\nYour membership stays active until ${fmtDate(
          membership.expiresOn,
        )}.`,
      relatedTable: "memberships",
      relatedRowId: membershipId,
    });
  }

  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// approveMembershipCancellation — office actually pulls the plug
// ---------------------------------------------------------------------------

export async function approveMembershipCancellation(
  input: z.input<typeof ApproveSchema>,
): Promise<ActionResult> {
  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { membershipId, flagRefund, adminNote } = parsed.data;
  const { person: admin } = await requireAdmin();

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      cancellationRequester: {
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
      household: {
        select: {
          primaryContactPersonId: true,
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
  if (!membership) return { ok: false, error: "Membership not found." };
  if (membership.status === "cancelled") {
    return { ok: false, error: "This membership is already cancelled." };
  }

  const beforeSnapshot = membership;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledByPersonId: admin.id,
        refundRequestedAt: flagRefund ? now : null,
      },
    });
    await recordAudit({
      tx,
      tableName: "memberships",
      rowId: membershipId,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSnapshot,
      after: updated,
      changeSource: "admin_console",
    });
  });

  // Tell whoever filed the request first; fall back to the household
  // primary contact so a cancellation doesn't go silent if the requester
  // was an unlinked guardian.
  const recipients = new Map<
    string,
    { id: string; primaryEmail: string | null }
  >();
  if (membership.cancellationRequester) {
    recipients.set(membership.cancellationRequester.id, {
      id: membership.cancellationRequester.id,
      primaryEmail: primaryEmailOf(membership.cancellationRequester),
    });
  }
  if (membership.household.primaryContact) {
    recipients.set(membership.household.primaryContact.id, {
      id: membership.household.primaryContact.id,
      primaryEmail: primaryEmailOf(membership.household.primaryContact),
    });
  }

  await Promise.all(
    [...recipients.values()].map((r) =>
      notify({
        recipientPersonId: r.id,
        recipientEmail: r.primaryEmail,
        channels: r.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "membership.cancelled",
        subject: "Your membership is cancelled",
        body:
          `Your household membership has been cancelled.\n\n` +
          (adminNote ? `Office note: ${adminNote}\n\n` : "") +
          (flagRefund
            ? "We've flagged this for a refund — the office will be in touch.\n\n"
            : "") +
          `If this was a mistake, reply to this notification or call the office.`,
        relatedTable: "memberships",
        relatedRowId: membershipId,
      }),
    ),
  );

  revalidateAll();
  if (flagRefund) revalidatePath("/admin/payments");
  return { ok: true };
}
