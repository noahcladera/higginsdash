"use server";

/**
 * Season-end review actions: a coach signs off on each enrollment with
 * "stayed", "promoted", or "demoted" near `series.endsOn`. Promotion
 * and demotion route through the shared {@link changeStudentSkillLevel}
 * pipeline so `student_skill_history` + parent notifications stay in
 * one place. "Stayed" still notifies the parent so they know the
 * coach's eyes were on it.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { notify } from "@/lib/notifications/notify";
import {
  formatSkillLevel,
  getNextSkillLevel,
  getPreviousSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import { changeStudentSkillLevel } from "@/lib/levels/student-level-pipeline";

const SKILL_LEVELS = [
  "red_1",
  "red_2",
  "red_3",
  "orange_1",
  "orange_2",
  "orange_3",
  "green_1",
  "green_2",
  "yellow",
  "adult_beginner_beginner",
  "adult_beginner_intermediate",
  "adult_advanced_beginner",
  "adult_intermediate",
  "adult_advanced",
] as const;

const RecordReviewSchema = z.object({
  enrollmentId: z.string().uuid(),
  outcome: z.enum(["stayed", "promoted", "demoted"]),
  /** Optional explicit target — defaults to neighbouring level on the ladder. */
  toLevel: z.enum(SKILL_LEVELS).optional(),
  comment: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v?.trim() === "" ? null : v?.trim() ?? null)),
});

export async function recordReview(formData: FormData) {
  const parsed = RecordReviewSchema.parse({
    enrollmentId: formData.get("enrollmentId"),
    outcome: formData.get("outcome"),
    toLevel: formData.get("toLevel") || undefined,
    comment: formData.get("comment") ?? undefined,
  });

  const { person, allowedClubIds } = await requireCoach();
  const clubScope = classSeriesClubScope(allowedClubIds);

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: parsed.enrollmentId,
      classSeries: {
        coaches: { some: { coachPersonId: person.id } },
        ...clubScope,
      },
    },
    select: {
      id: true,
      classSeriesId: true,
      studentPersonId: true,
      student: {
        select: {
          skillLevel: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
      levelReview: { select: { id: true } },
    },
  });
  if (!enrollment) {
    throw new Error(
      "You can only review enrollments in your own classes.",
    );
  }
  if (enrollment.levelReview) {
    throw new Error(
      "This enrollment already has a season review on file.",
    );
  }

  const fromLevel = enrollment.student.skillLevel as SkillLevelValue | null;

  // Resolve the target level when the form didn't pin one. `stayed`
  // keeps the same level (toLevel = null in the DB). promoted/demoted
  // walk the ladder.
  let resolvedToLevel: SkillLevelValue | null = null;
  if (parsed.outcome === "stayed") {
    resolvedToLevel = null;
  } else if (parsed.outcome === "promoted") {
    resolvedToLevel = parsed.toLevel ?? getNextSkillLevel(fromLevel);
    if (!resolvedToLevel) {
      throw new Error(
        `${formatSkillLevel(fromLevel)} is the top of the ladder; nothing to promote to.`,
      );
    }
  } else {
    resolvedToLevel = parsed.toLevel ?? getPreviousSkillLevel(fromLevel);
    if (!resolvedToLevel) {
      throw new Error(
        `${formatSkillLevel(fromLevel)} is the bottom of the ladder; nothing to demote to.`,
      );
    }
  }

  await prisma.enrollmentLevelReview.create({
    data: {
      enrollmentId: enrollment.id,
      decidedByPersonId: person.id,
      outcome: parsed.outcome,
      fromLevel: fromLevel ?? undefined,
      toLevel: resolvedToLevel ?? undefined,
      comment: parsed.comment,
    },
  });

  if (parsed.outcome === "stayed") {
    // Still ping the parents so they know the coach assessed and
    // chose to keep the level. Carries the optional comment.
    const studentName =
      [
        enrollment.student.person.firstName,
        enrollment.student.person.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || "Your child";
    const adults = await getHouseholdAdultsForStudent(
      enrollment.studentPersonId,
    );
    const actor =
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      "Your coach";
    const subject = `${studentName} stays at ${formatSkillLevel(fromLevel)}`;
    const body = `${actor} reviewed ${studentName}'s level for the season and is keeping them at ${formatSkillLevel(fromLevel)}.${parsed.comment ? `\n\n${parsed.comment}` : ""}`;
    for (const adultId of adults) {
      await notify({
        recipientPersonId: adultId,
        templateKey: "progression.season_review.stayed",
        subject,
        body,
        relatedTable: "students",
        relatedRowId: enrollment.studentPersonId,
      });
    }
  } else {
    // Promotion / demotion writes through the shared pipeline so we
    // get the StudentSkillHistory row and notification fan-out for
    // free. Reason maps to "season_review" so the audit trail is
    // distinguishable from ad-hoc edits and one-off promotes.
    await changeStudentSkillLevel({
      studentPersonId: enrollment.studentPersonId,
      toLevel: resolvedToLevel,
      changedByPersonId: person.id,
      changedByDisplayName:
        [person.firstName, person.lastName].filter(Boolean).join(" ") ||
        undefined,
      reason: "season_review",
      note: parsed.comment,
    });
  }

  revalidatePath(`/coach/classes/${enrollment.classSeriesId}`);
  revalidatePath(
    `/coach/classes/${enrollment.classSeriesId}/students/${enrollment.studentPersonId}`,
  );
  revalidatePath("/admin/inbox");
  revalidatePath("/portal/family");
}

async function getHouseholdAdultsForStudent(
  studentPersonId: string,
): Promise<string[]> {
  const member = await prisma.householdMember.findUnique({
    where: { personId: studentPersonId },
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
  return member?.household.members.map((m) => m.personId) ?? [];
}
