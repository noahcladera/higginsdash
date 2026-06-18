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
import {
  formatMedalLevel,
  getNextMedalLevel,
  getPreviousMedalLevel,
  isMedalEligible,
  type MedalLevelValue,
} from "@/lib/medal-levels";
import { changeStudentSkillLevel } from "@/lib/levels/student-level-pipeline";
import { changeStudentMedalLevel } from "@/lib/medals/student-medal-pipeline";
import type { MedalLevel, SkillLevel } from "@prisma/client";

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

const MEDAL_LEVELS = [
  "rwb",
  "yellow",
  "purple",
  "blue_1",
  "blue_2",
  "red_1",
  "red_2",
  "orange_1",
  "orange_2",
  "green_1",
  "green_2",
] as const;

const MedalLevelEnum = z.enum(MEDAL_LEVELS);

const RecordReviewSchema = z.object({
  enrollmentId: z.string().uuid(),
  outcome: z.enum(["stayed", "promoted", "demoted"]),
  toLevel: z.union([z.enum(SKILL_LEVELS), MedalLevelEnum]).optional(),
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
          medalLevel: true,
          person: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              householdMember: { select: { roleInHousehold: true } },
            },
          },
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

  const medalEligible = isMedalEligible({
    dateOfBirth: enrollment.student.person.dateOfBirth,
    roleInHousehold:
      enrollment.student.person.householdMember?.roleInHousehold ?? null,
  });

  const fromSkillLevel = enrollment.student.skillLevel as SkillLevelValue | null;
  const fromMedalLevel = enrollment.student.medalLevel as MedalLevelValue | null;
  const formatLevel = (level: string | null) =>
    medalEligible ? formatMedalLevel(level) : formatSkillLevel(level);

  let resolvedToSkill: SkillLevel | null = null;
  let resolvedToMedal: MedalLevel | null = null;

  if (parsed.outcome === "stayed") {
    resolvedToSkill = null;
    resolvedToMedal = null;
  } else if (parsed.outcome === "promoted") {
    if (medalEligible) {
      resolvedToMedal =
        (parsed.toLevel as MedalLevel | undefined) ??
        getNextMedalLevel(fromMedalLevel);
      if (!resolvedToMedal) {
        throw new Error(
          `${formatMedalLevel(fromMedalLevel)} is the top of the medal ladder; nothing to promote to.`,
        );
      }
    } else {
      resolvedToSkill =
        (parsed.toLevel as SkillLevel | undefined) ??
        getNextSkillLevel(fromSkillLevel);
      if (!resolvedToSkill) {
        throw new Error(
          `${formatSkillLevel(fromSkillLevel)} is the top of the ladder; nothing to promote to.`,
        );
      }
    }
  } else {
    if (medalEligible) {
      resolvedToMedal =
        (parsed.toLevel as MedalLevel | undefined) ??
        getPreviousMedalLevel(fromMedalLevel);
      if (!resolvedToMedal) {
        throw new Error(
          `${formatMedalLevel(fromMedalLevel)} is the bottom of the medal ladder; nothing to demote to.`,
        );
      }
    } else {
      resolvedToSkill =
        (parsed.toLevel as SkillLevel | undefined) ??
        getPreviousSkillLevel(fromSkillLevel);
      if (!resolvedToSkill) {
        throw new Error(
          `${formatSkillLevel(fromSkillLevel)} is the bottom of the ladder; nothing to demote to.`,
        );
      }
    }
  }

  const fromLevel = medalEligible ? fromMedalLevel : fromSkillLevel;
  const resolvedToLevel = medalEligible ? resolvedToMedal : resolvedToSkill;

  await prisma.enrollmentLevelReview.create({
    data: {
      enrollmentId: enrollment.id,
      decidedByPersonId: person.id,
      outcome: parsed.outcome,
      fromLevel: medalEligible
        ? undefined
        : ((fromSkillLevel ?? undefined) as SkillLevel | undefined),
      toLevel: medalEligible
        ? undefined
        : ((resolvedToSkill ?? undefined) as SkillLevel | undefined),
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
    const subject = `${studentName} stays at ${formatLevel(fromLevel)}`;
    const body = `${actor} reviewed ${studentName}'s level for the season and is keeping them at ${formatLevel(fromLevel)}.${parsed.comment ? `\n\n${parsed.comment}` : ""}`;
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
  } else if (medalEligible) {
    await changeStudentMedalLevel({
      studentPersonId: enrollment.studentPersonId,
      toLevel: resolvedToMedal,
      changedByPersonId: person.id,
      changedByDisplayName:
        [person.firstName, person.lastName].filter(Boolean).join(" ") ||
        undefined,
      reason: "season_review",
      note: parsed.comment,
    });
  } else {
    await changeStudentSkillLevel({
      studentPersonId: enrollment.studentPersonId,
      toLevel: resolvedToSkill,
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
