"use server";

/**
 * Coach swap workflow (issue #2 family — phase 5).
 *
 * Two server actions glue the request → assign loop together:
 *
 *   - `requestCoachSub`  → coach raises a "I can't make this session"
 *                          ticket. Inserts a `CoachSubRequest` row and
 *                          notifies admins.
 *   - `assignCoachSub`   → admin picks a substitute. Inserts a
 *                          `ClassSessionCoach` row with `is_substitute=true`,
 *                          flips the request to `filled`, notifies the
 *                          requester + the new sub.
 *   - `cancelCoachSub`   → requester (or admin) revokes a pending request
 *                          (e.g. they're available again, or the session
 *                          got cancelled).
 *
 * Notifications and audit go through the shared `notify()` / `recordAudit()`
 * helpers so this surface lights up the inboxes the same way the booking
 * cancellation queue does.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
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

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RequestSubSchema = z.object({
  classSessionId: z.string().uuid(),
  reason: z.string().trim().min(5).max(2000),
});

const AssignSubSchema = z.object({
  requestId: z.string().uuid(),
  substituteCoachPersonId: z.string().uuid(),
  adminNote: z.string().trim().max(2000).optional(),
});

const DenySubSchema = z.object({
  requestId: z.string().uuid(),
  adminNote: z.string().trim().min(5).max(2000),
});

const CancelSubSchema = z.object({
  requestId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function revalidateInboxes() {
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/coach-subs");
  revalidatePath("/coach/inbox");
  revalidatePath("/coach");
  revalidatePath("/coach/calendar");
}

// ---------------------------------------------------------------------------
// requestCoachSub — coach surfaces an "I need a sub" ticket
// ---------------------------------------------------------------------------

export async function requestCoachSub(
  input: z.input<typeof RequestSubSchema>,
): Promise<ActionResult> {
  const parsed = RequestSubSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please give a reason of at least 5 characters.",
    };
  }
  const { classSessionId, reason } = parsed.data;

  const { person } = await requireCoach();

  const session = await prisma.classSession.findUnique({
    where: { id: classSessionId },
    include: {
      classSeries: {
        select: {
          id: true,
          name: true,
          coaches: { select: { coachPersonId: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, error: "Session not found." };

  const coachIsOnSeries = session.classSeries.coaches.some(
    (c) => c.coachPersonId === person.id,
  );
  if (!coachIsOnSeries) {
    return {
      ok: false,
      error: "You can only request a sub for a session you teach.",
    };
  }
  if (session.status === "cancelled" || session.cancelledAt) {
    return { ok: false, error: "This session is cancelled." };
  }
  if (session.startsAt.getTime() <= Date.now()) {
    return {
      ok: false,
      error: "This session has already started — talk to the office directly.",
    };
  }

  const existing = await prisma.coachSubRequest.findFirst({
    where: {
      classSessionId,
      requesterCoachPersonId: person.id,
      status: "pending",
    },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: "You already have a pending sub request for this session.",
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.coachSubRequest.create({
      data: {
        classSessionId,
        requesterCoachPersonId: person.id,
        reason,
        status: "pending",
      },
    });
    await recordAudit({
      tx,
      tableName: "coach_sub_requests",
      rowId: row.id,
      action: "insert",
      changedByPersonId: person.id,
      after: row,
    });
    return row;
  });

  const admins = await getAdminRecipients();
  const dateLabel = fmtDate(session.startsAt);
  const requesterName = `${person.firstName} ${person.lastName}`.trim();
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipientPersonId: admin.id,
        recipientEmail: admin.primaryEmail,
        channels: admin.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "coach.sub.requested",
        subject: `Sub request from ${requesterName}`,
        body:
          `${requesterName} can't make ${session.classSeries.name} on ${dateLabel}.\n\n` +
          `Reason: ${reason}\n\nAssign a substitute in /admin/coach-subs.`,
        relatedTable: "coach_sub_requests",
        relatedRowId: created.id,
      }),
    ),
  );

  revalidateInboxes();
  revalidatePath(`/coach/classes/${session.classSeries.id}/sessions/${classSessionId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// assignCoachSub — admin fills the request with a substitute
// ---------------------------------------------------------------------------

export async function assignCoachSub(
  input: z.input<typeof AssignSubSchema>,
): Promise<ActionResult> {
  const parsed = AssignSubSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const { requestId, substituteCoachPersonId, adminNote } = parsed.data;

  const { person: admin } = await requireAdmin();

  const request = await prisma.coachSubRequest.findUnique({
    where: { id: requestId },
    include: {
      classSession: {
        include: {
          classSeries: {
            select: {
              id: true,
              name: true,
              coaches: {
                where: { coachPersonId: substituteCoachPersonId },
                select: { role: true, payRateOverride: true },
                take: 1,
              },
            },
          },
        },
      },
      requesterCoach: {
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
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return { ok: false, error: "This request is no longer pending." };
  }
  if (substituteCoachPersonId === request.requesterCoachPersonId) {
    return { ok: false, error: "Substitute must be a different coach." };
  }

  const sub = await prisma.coach.findUnique({
    where: { personId: substituteCoachPersonId },
    include: {
      person: {
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
  if (!sub) return { ok: false, error: "Substitute coach not found." };

  // Default sub to the same role the requester held on the series, falling
  // back to "lead" if the sub is brand new to this series.
  const subSeriesRow = request.classSession.classSeries.coaches[0];
  const role = subSeriesRow?.role ?? "assistant";

  const beforeSnapshot = request;

  await prisma.$transaction(async (tx) => {
    // Idempotent: if a class_session_coaches row already exists for this
    // (session, coach) we just mark it as the substitute. The unique
    // constraint stops us from inserting twice.
    await tx.classSessionCoach.upsert({
      where: {
        classSessionId_coachPersonId: {
          classSessionId: request.classSessionId,
          coachPersonId: substituteCoachPersonId,
        },
      },
      update: {
        isSubstitute: true,
        substitutingForPersonId: request.requesterCoachPersonId,
        role,
      },
      create: {
        classSessionId: request.classSessionId,
        coachPersonId: substituteCoachPersonId,
        role,
        isSubstitute: true,
        substitutingForPersonId: request.requesterCoachPersonId,
        payRateOverride: subSeriesRow?.payRateOverride ?? null,
      },
    });

    const updated = await tx.coachSubRequest.update({
      where: { id: requestId },
      data: {
        status: "filled",
        filledByCoachPersonId: substituteCoachPersonId,
        filledAt: new Date(),
        decidedByPersonId: admin.id,
        adminNote: adminNote ?? null,
      },
    });

    await recordAudit({
      tx,
      tableName: "coach_sub_requests",
      rowId: requestId,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSnapshot,
      after: updated,
      changeSource: "admin_console",
    });
  });

  const dateLabel = fmtDate(request.classSession.startsAt);
  const requesterName =
    `${request.requesterCoach.firstName} ${request.requesterCoach.lastName}`.trim();
  const subName = `${sub.person.firstName} ${sub.person.lastName}`.trim();
  const seriesName = request.classSession.classSeries.name;

  // Notify the requester their sub is locked in.
  await notify({
    recipientPersonId: request.requesterCoachPersonId,
    recipientEmail: primaryEmailOf(request.requesterCoach),
    channels: primaryEmailOf(request.requesterCoach)
      ? ["in_app", "email"]
      : ["in_app"],
    templateKey: "coach.sub.assigned.requester",
    subject: `Sub assigned for ${seriesName}`,
    body:
      `${subName} will cover your ${seriesName} session on ${dateLabel}.\n\n` +
      (adminNote ? `Admin note: ${adminNote}\n\n` : "") +
      `Thanks for flagging this early.`,
    relatedTable: "coach_sub_requests",
    relatedRowId: requestId,
  });

  // Notify the substitute they were assigned (this is news to them).
  await notify({
    recipientPersonId: substituteCoachPersonId,
    recipientEmail: primaryEmailOf(sub.person),
    channels: primaryEmailOf(sub.person) ? ["in_app", "email"] : ["in_app"],
    templateKey: "coach.sub.assigned.substitute",
    subject: `You're covering ${seriesName} on ${dateLabel}`,
    body:
      `You've been assigned to cover ${requesterName}'s ${seriesName} session on ${dateLabel}.\n\n` +
      (adminNote ? `Admin note: ${adminNote}\n\n` : "") +
      `It's now on your coach calendar.`,
    relatedTable: "coach_sub_requests",
    relatedRowId: requestId,
  });

  revalidateInboxes();
  revalidatePath(
    `/coach/classes/${request.classSession.classSeries.id}/sessions/${request.classSessionId}`,
  );
  revalidatePath(`/admin/classes/${request.classSession.classSeries.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// denyCoachSub — admin can't fill the request
// ---------------------------------------------------------------------------

export async function denyCoachSub(
  input: z.input<typeof DenySubSchema>,
): Promise<ActionResult> {
  const parsed = DenySubSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please give a reason of at least 5 characters.",
    };
  }
  const { requestId, adminNote } = parsed.data;
  const { person: admin } = await requireAdmin();

  const request = await prisma.coachSubRequest.findUnique({
    where: { id: requestId },
    include: {
      classSession: {
        include: {
          classSeries: { select: { id: true, name: true } },
        },
      },
      requesterCoach: {
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
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return { ok: false, error: "This request is no longer pending." };
  }

  const beforeSnapshot = request;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.coachSubRequest.update({
      where: { id: requestId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        decidedByPersonId: admin.id,
        adminNote,
      },
    });
    await recordAudit({
      tx,
      tableName: "coach_sub_requests",
      rowId: requestId,
      action: "update",
      changedByPersonId: admin.id,
      before: beforeSnapshot,
      after: updated,
      changeSource: "admin_console",
    });
  });

  const dateLabel = fmtDate(request.classSession.startsAt);
  await notify({
    recipientPersonId: request.requesterCoachPersonId,
    recipientEmail: primaryEmailOf(request.requesterCoach),
    channels: primaryEmailOf(request.requesterCoach)
      ? ["in_app", "email"]
      : ["in_app"],
    templateKey: "coach.sub.denied",
    subject: `No sub available for ${request.classSession.classSeries.name}`,
    body:
      `We couldn't find a sub for your ${request.classSession.classSeries.name} session on ${dateLabel}.\n\n` +
      `Office note: ${adminNote}\n\nPlease teach the session as scheduled or call the office.`,
    relatedTable: "coach_sub_requests",
    relatedRowId: requestId,
  });

  revalidateInboxes();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// cancelCoachSub — requester (or admin) revokes a pending ticket
// ---------------------------------------------------------------------------

export async function cancelCoachSub(
  input: z.input<typeof CancelSubSchema>,
): Promise<ActionResult> {
  const parsed = CancelSubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { requestId } = parsed.data;

  const { person } = await requireCoach();

  const request = await prisma.coachSubRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "pending") {
    return { ok: false, error: "This request is no longer pending." };
  }
  // Coaches can only revoke their own ticket. Admins are always allowed.
  if (
    request.requesterCoachPersonId !== person.id &&
    !(person as { isAdmin?: boolean }).isAdmin
  ) {
    return { ok: false, error: "You can only cancel your own request." };
  }

  const beforeSnapshot = request;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.coachSubRequest.update({
      where: { id: requestId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        decidedByPersonId: person.id,
      },
    });
    await recordAudit({
      tx,
      tableName: "coach_sub_requests",
      rowId: requestId,
      action: "update",
      changedByPersonId: person.id,
      before: beforeSnapshot,
      after: updated,
    });
  });

  const admins = await getAdminRecipients();
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipientPersonId: admin.id,
        recipientEmail: admin.primaryEmail,
        channels: admin.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "coach.sub.requester_cancelled",
        subject: "Sub request withdrawn",
        body: `${person.firstName} ${person.lastName} withdrew their pending sub request.`,
        relatedTable: "coach_sub_requests",
        relatedRowId: requestId,
      }),
    ),
  );

  revalidateInboxes();
  return { ok: true };
}
