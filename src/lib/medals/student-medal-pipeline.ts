/**
 * Shared "change a student's medal level" pipeline for under-18 students.
 * Mirrors {@link changeStudentSkillLevel} for the medal ladder.
 */

import type { MedalLevel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { formatMedalLevel } from "@/lib/medal-levels";

export type MedalChangeReason =
  | "coach_edit"
  | "coach_promote"
  | "season_review";

export interface ChangeStudentMedalLevelInput {
  studentPersonId: string;
  toLevel: MedalLevel | null;
  changedByPersonId: string;
  changedByDisplayName?: string;
  reason: MedalChangeReason;
  note?: string | null;
}

export interface ChangeStudentMedalLevelResult {
  changed: boolean;
  fromLevel: MedalLevel | null;
  toLevel: MedalLevel | null;
}

export async function changeStudentMedalLevel(
  input: ChangeStudentMedalLevelInput,
): Promise<ChangeStudentMedalLevelResult> {
  const before = await prisma.student.findUnique({
    where: { personId: input.studentPersonId },
    select: {
      medalLevel: true,
      person: {
        select: { firstName: true, lastName: true },
      },
    },
  });
  if (!before) {
    throw new Error("This person is not a student.");
  }

  if (before.medalLevel === input.toLevel) {
    return {
      changed: false,
      fromLevel: before.medalLevel,
      toLevel: input.toLevel,
    };
  }

  const member = await prisma.householdMember.findUnique({
    where: { personId: input.studentPersonId },
    select: {
      household: {
        select: {
          members: {
            where: { roleInHousehold: "adult" },
            select: { personId: true },
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

  const fromLabel = formatMedalLevel(before.medalLevel);
  const toLabel = formatMedalLevel(input.toLevel);
  const verb =
    input.reason === "coach_promote" || input.reason === "season_review"
      ? "moved up to"
      : "is now at";
  const subject = `${studentName} ${verb} ${toLabel}`;
  const actor = input.changedByDisplayName?.trim() || "Your coach";
  const noteLine = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const body = `${actor} updated ${studentName}'s medal level from ${fromLabel} to ${toLabel}.${noteLine}`;

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { personId: input.studentPersonId },
      data: { medalLevel: input.toLevel },
    });
    await tx.studentMedalHistory.create({
      data: {
        studentId: input.studentPersonId,
        fromLevel: before.medalLevel,
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
            ? "progression.medal.promoted"
            : "progression.medal.changed",
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
    fromLevel: before.medalLevel,
    toLevel: input.toLevel,
  };
}
