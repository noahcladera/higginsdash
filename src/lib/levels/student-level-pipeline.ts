/**
 * Shared "change a student's skill level" pipeline used by every coach
 * surface (manual dropdown edit, rubric "promote" button, season review
 * action). Centralises three things so callers don't drift:
 *
 *   1. Update `students.skill_level`.
 *   2. Append a row to `student_skill_history` (R-B audit trail).
 *   3. Fan an in-app notification out to every adult in the student's
 *      household via {@link notify}.
 *
 * Everything happens inside one transaction so a notification only
 * lands when the level actually changed.
 */

import type { Prisma, SkillLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { formatSkillLevel } from "@/lib/skill-levels";

export type SkillChangeReason =
  | "coach_edit"
  | "coach_promote"
  | "season_review";

export interface ChangeStudentSkillLevelInput {
  studentPersonId: string;
  /** New level. Pass `null` to clear ("Not set"). */
  toLevel: SkillLevel | null;
  /** Person making the call (a coach or admin). */
  changedByPersonId: string;
  /** Display name for the actor — used in the parent-facing notification body. */
  changedByDisplayName?: string;
  reason: SkillChangeReason;
  /** Optional free-text note appended to the notification body. */
  note?: string | null;
}

export interface ChangeStudentSkillLevelResult {
  /** True when the level actually changed (history row written, parents notified). */
  changed: boolean;
  fromLevel: SkillLevel | null;
  toLevel: SkillLevel | null;
}

/**
 * Apply a level change. No-op (returns `changed: false`) when the
 * student is already at `toLevel` so that re-saving a form doesn't
 * spam parents with duplicate notifications.
 */
export async function changeStudentSkillLevel(
  input: ChangeStudentSkillLevelInput,
): Promise<ChangeStudentSkillLevelResult> {
  const before = await prisma.student.findUnique({
    where: { personId: input.studentPersonId },
    select: {
      skillLevel: true,
      person: {
        select: { firstName: true, lastName: true },
      },
    },
  });
  if (!before) {
    throw new Error("This person is not a student.");
  }

  if (before.skillLevel === input.toLevel) {
    return {
      changed: false,
      fromLevel: before.skillLevel,
      toLevel: input.toLevel,
    };
  }

  // Resolve the household adults outside the transaction — purely a
  // read, doesn't need to be inside the atomic boundary. We need them
  // for the notification fan-out.
  const member = await prisma.householdMember.findUnique({
    where: { personId: input.studentPersonId },
    select: {
      household: {
        select: {
          members: {
            where: { roleInHousehold: "adult" },
            select: {
              personId: true,
              person: {
                select: {
                  emails: {
                    where: { archivedAt: null },
                    orderBy: { isPrimary: "desc" },
                    take: 1,
                    select: { address: true, isPrimary: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const adults = member?.household.members ?? [];
  const studentName =
    [before.person.firstName, before.person.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "Your child";

  const fromLabel = formatSkillLevel(before.skillLevel);
  const toLabel = formatSkillLevel(input.toLevel);
  const verb =
    input.reason === "coach_promote" || input.reason === "season_review"
      ? "moved up to"
      : "is now at";
  const subject = `${studentName} ${verb} ${toLabel}`;
  const actor = input.changedByDisplayName?.trim() || "Your coach";
  const noteLine = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const body = `${actor} updated ${studentName}'s level from ${fromLabel} to ${toLabel}.${noteLine}`;

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { personId: input.studentPersonId },
      data: { skillLevel: input.toLevel },
    });
    await tx.studentSkillHistory.create({
      data: {
        studentId: input.studentPersonId,
        fromLevel: before.skillLevel,
        toLevel: input.toLevel,
        changedByPersonId: input.changedByPersonId,
        reason: input.reason,
      },
    });

    for (const adult of adults) {
      await notify({
        recipientPersonId: adult.personId,
        templateKey:
          input.reason === "coach_promote" || input.reason === "season_review"
            ? "progression.level.promoted"
            : "progression.level.changed",
        subject,
        body,
        relatedTable: "students",
        relatedRowId: input.studentPersonId,
        tx: tx as Prisma.TransactionClient,
      });
    }
  });

  return {
    changed: true,
    fromLevel: before.skillLevel,
    toLevel: input.toLevel,
  };
}
