"use server";

/**
 * Self-serve "I can't make this one" for upcoming class sessions.
 *
 * We piggyback on the existing `Attendance` model: an `excused` row written
 * BEFORE the session has happened means "the student is planning to skip."
 * Coaches see the same row in their roster so they're not waiting for a
 * no-show. After the session, the row stops being a forward-looking flag
 * and becomes the historical record (no schema change needed).
 *
 * Auth: members can only mark sessions for themselves or someone they're
 * a guardian of. The corresponding enrollment must be live and the session
 * must be in the future and not cancelled.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import { requireCoach } from "@/lib/auth/require-coach";
import { isGuardianOf } from "@/lib/portal/queries";
import { notify, primaryEmailOf } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { getTerms } from "@/lib/tenant";

const Input = z.object({
  classSessionId: z.string().uuid(),
  studentPersonId: z.string().uuid(),
  reason: z.string().trim().max(400).optional(),
});

export type SkipResult =
  | { ok: true; attendanceId: string }
  | { ok: false; error: string };

export async function markPlannedAbsence(input: {
  classSessionId: string;
  studentPersonId: string;
  reason?: string;
}): Promise<SkipResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { classSessionId, studentPersonId, reason } = parsed.data;

  const { person } = await requireMember();
  const allowed =
    studentPersonId === person.id ||
    (await isGuardianOf(person.id, studentPersonId));
  if (!allowed) {
    return {
      ok: false,
      error: "You can only mark absences for yourself or your own children.",
    };
  }

  const session = await prisma.classSession.findUnique({
    where: { id: classSessionId },
    select: {
      id: true,
      startsAt: true,
      status: true,
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
  if (session.status === "cancelled") {
    return { ok: false, error: "This session is already cancelled." };
  }
  const terms = await getTerms();
  if (session.startsAt <= new Date()) {
    return {
      ok: false,
      error: `This session has already started — message your ${terms.coach.singular.toLowerCase()} instead.`,
    };
  }

  // Make sure the student has a live enrollment in this series. Excused
  // attendance for a non-enrolled student would be confusing.
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId: session.classSeries.id,
        studentPersonId,
      },
    },
    select: { id: true, status: true },
  });
  if (!enrollment || enrollment.status === "withdrawn") {
    return {
      ok: false,
      error: "We can't find an active enrollment for that student in this class.",
    };
  }

  // Make sure the student row exists (Attendance FK requires it).
  const studentExisting = await prisma.student.findUnique({
    where: { personId: studentPersonId },
    select: { personId: true },
  });
  if (!studentExisting) {
    await prisma.student.create({ data: { personId: studentPersonId } });
  }

  // Upsert so a member who clicks twice doesn't 500. The unique
  // constraint is `(classSessionId, studentPersonId)`.
  const attendance = await prisma.attendance.upsert({
    where: {
      classSessionId_studentPersonId: {
        classSessionId,
        studentPersonId,
      },
    },
    create: {
      classSessionId,
      studentPersonId,
      status: "excused",
      notes: reason ?? null,
      recordedByPersonId: person.id,
    },
    update: {
      status: "excused",
      notes: reason ?? null,
      recordedByPersonId: person.id,
    },
    select: { id: true, status: true },
  });

  await recordAudit({
    tableName: "attendance",
    rowId: attendance.id,
    action: "update",
    changedByPersonId: person.id,
    after: { status: "excused", reason: reason ?? null },
  });

  // Notify the series coaches so they're not waiting on a no-show.
  const student = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: { firstName: true, lastName: true },
  });
  const studentName = student
    ? `${student.firstName} ${student.lastName}`.trim()
    : "Student";
  const dateLabel = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(session.startsAt);
  const coachIds = session.classSeries.coaches.map((c) => c.coachPersonId);
  if (coachIds.length > 0) {
    const coaches = await prisma.person.findMany({
      where: { id: { in: coachIds } },
      select: {
        id: true,
        emails: {
          where: { isPrimary: true, archivedAt: null },
          select: { address: true, isPrimary: true },
          take: 1,
        },
      },
    });
    await Promise.all(
      coaches.map((c) =>
        notify({
          recipientPersonId: c.id,
          recipientEmail: primaryEmailOf({ emails: c.emails }),
          channels: c.emails[0] ? ["in_app", "email"] : ["in_app"],
          templateKey: "attendance.excused.planned",
          subject: `${studentName} will skip ${session.classSeries.name} on ${dateLabel}`,
          body: `${studentName} let us know they can't make ${session.classSeries.name} on ${dateLabel}.${reason ? `\n\nReason: ${reason}` : ""}`,
          relatedTable: "attendance",
          relatedRowId: attendance.id,
        }),
      ),
    );
  }

  revalidatePath("/portal/classes");
  revalidatePath("/portal/inbox");
  revalidatePath(`/coach/classes/${session.classSeries.id}`);
  revalidatePath(`/coach/classes/${session.classSeries.id}/sessions/${session.id}`);
  revalidatePath(`/admin/classes/${session.classSeries.id}`);

  return { ok: true, attendanceId: attendance.id };
}

// ---------------------------------------------------------------------------
// Coach roll-call — mark present / absent / late / excused for a session.
// ---------------------------------------------------------------------------

const RollCallInput = z.object({
  classSessionId: z.string().uuid(),
  studentPersonId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
});

export type RollCallResult =
  | { ok: true; attendanceId: string; status: string }
  | { ok: false; error: string };

/**
 * Coach marks a roster student present/absent/late/excused for one session.
 * Authorization: the acting coach must be assigned to the series, OR be a
 * substitute on this specific session. Idempotent upsert on
 * `(classSessionId, studentPersonId)`.
 */
export async function markAttendance(input: {
  classSessionId: string;
  studentPersonId: string;
  status: "present" | "absent" | "late" | "excused";
}): Promise<RollCallResult> {
  const parsed = RollCallInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { classSessionId, studentPersonId, status } = parsed.data;

  const { person } = await requireCoach();

  const session = await prisma.classSession.findUnique({
    where: { id: classSessionId },
    select: {
      id: true,
      classSeries: {
        select: {
          id: true,
          coaches: { select: { coachPersonId: true } },
        },
      },
      coaches: {
        select: { coachPersonId: true, substitutingForPersonId: true },
      },
    },
  });
  if (!session) return { ok: false, error: "Session not found." };

  const isSeriesCoach = session.classSeries.coaches.some(
    (c) => c.coachPersonId === person.id,
  );
  const isSessionCoach = session.coaches.some(
    (c) =>
      c.coachPersonId === person.id ||
      c.substitutingForPersonId === person.id,
  );
  if (!isSeriesCoach && !isSessionCoach) {
    return {
      ok: false,
      error: "You can only mark attendance for classes you coach.",
    };
  }

  // Student must have a live (non-withdrawn) enrollment in this series.
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId: session.classSeries.id,
        studentPersonId,
      },
    },
    select: { status: true },
  });
  if (!enrollment || enrollment.status === "withdrawn") {
    return {
      ok: false,
      error: "That student isn't on this class roster.",
    };
  }

  // Attendance FK requires a Student row.
  const studentExisting = await prisma.student.findUnique({
    where: { personId: studentPersonId },
    select: { personId: true },
  });
  if (!studentExisting) {
    await prisma.student.create({ data: { personId: studentPersonId } });
  }

  const attendance = await prisma.attendance.upsert({
    where: {
      classSessionId_studentPersonId: { classSessionId, studentPersonId },
    },
    create: {
      classSessionId,
      studentPersonId,
      status,
      recordedByPersonId: person.id,
    },
    update: { status, recordedByPersonId: person.id },
    select: { id: true, status: true },
  });

  await recordAudit({
    tableName: "attendance",
    rowId: attendance.id,
    action: "update",
    changedByPersonId: person.id,
    after: { status, source: "coach_roll_call" },
  });

  revalidatePath(
    `/coach/classes/${session.classSeries.id}/sessions/${classSessionId}`,
  );
  revalidatePath(`/admin/classes/${session.classSeries.id}`);

  return { ok: true, attendanceId: attendance.id, status: attendance.status };
}

const UnmarkInput = z.object({
  classSessionId: z.string().uuid(),
  studentPersonId: z.string().uuid(),
});

export async function unmarkPlannedAbsence(input: {
  classSessionId: string;
  studentPersonId: string;
}): Promise<SkipResult> {
  const parsed = UnmarkInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { classSessionId, studentPersonId } = parsed.data;

  const { person } = await requireMember();
  const allowed =
    studentPersonId === person.id ||
    (await isGuardianOf(person.id, studentPersonId));
  if (!allowed) {
    return {
      ok: false,
      error: "You can only undo absences for yourself or your own children.",
    };
  }

  const terms = await getTerms();
  const existing = await prisma.attendance.findUnique({
    where: {
      classSessionId_studentPersonId: { classSessionId, studentPersonId },
    },
    select: {
      id: true,
      status: true,
      classSession: {
        select: {
          startsAt: true,
          classSeriesId: true,
        },
      },
    },
  });
  if (!existing) return { ok: true, attendanceId: "" };
  if (existing.status !== "excused") {
    return {
      ok: false,
      error: "Only planned absences can be undone here.",
    };
  }
  if (existing.classSession.startsAt <= new Date()) {
    return {
      ok: false,
      error: `This session has already started — message your ${terms.coach.singular.toLowerCase()} instead.`,
    };
  }

  await prisma.attendance.delete({ where: { id: existing.id } });
  await recordAudit({
    tableName: "attendance",
    rowId: existing.id,
    action: "delete",
    changedByPersonId: person.id,
    before: { status: "excused" },
  });

  revalidatePath("/portal/classes");
  revalidatePath(`/coach/classes/${existing.classSession.classSeriesId}`);
  revalidatePath(`/admin/classes/${existing.classSession.classSeriesId}`);

  return { ok: true, attendanceId: existing.id };
}
