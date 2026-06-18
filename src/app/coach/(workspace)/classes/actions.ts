"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { requireCoach } from "@/lib/auth/require-coach";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";
import { changeStudentSkillLevel } from "@/lib/levels/student-level-pipeline";
import { changeStudentMedalLevel } from "@/lib/medals/student-medal-pipeline";
import { isAdultSkillEligible, isMedalEligible } from "@/lib/medal-levels";
import type { MedalLevel } from "@prisma/client";

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

const SkillLevelEnum = z.enum(SKILL_LEVELS);

const CoachSkillLevelInputSchema = z.object({
  studentPersonId: z.string().uuid(),
  classSeriesId: z.string().uuid(),
  skillLevel: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .pipe(z.union([SkillLevelEnum, z.null()])),
});

function assertNotSystem(id: string) {
  if (id === SYSTEM_PERSON_ID) {
    throw new Error("Cannot modify the system placeholder.");
  }
}

const CoachMedalLevelInputSchema = z.object({
  studentPersonId: z.string().uuid(),
  classSeriesId: z.string().uuid(),
  medalLevel: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .pipe(z.union([MedalLevelEnum, z.null()])),
});

async function assertCoachCanEditStudentInSeries(
  coachPersonId: string,
  classSeriesId: string,
  studentPersonId: string,
  allowedClubIds: string[] | null,
) {
  const clubScope = classSeriesClubScope(allowedClubIds);
  const ok = await prisma.classSeries.findFirst({
    where: {
      id: classSeriesId,
      coaches: { some: { coachPersonId } },
      ...clubScope,
      enrollments: {
        some: {
          studentPersonId,
          status: { in: ["active", "waitlist"] },
        },
      },
    },
    select: { id: true },
  });
  if (!ok) {
    throw new Error("You can only update levels for students in your classes.");
  }
}

async function getStudentEligibility(studentPersonId: string) {
  const row = await prisma.person.findUnique({
    where: { id: studentPersonId },
    select: {
      dateOfBirth: true,
      householdMember: { select: { roleInHousehold: true } },
    },
  });
  if (!row) throw new Error("Student not found.");
  return {
    medalEligible: isMedalEligible({
      dateOfBirth: row.dateOfBirth,
      roleInHousehold: row.householdMember?.roleInHousehold ?? null,
    }),
    adultSkillEligible: isAdultSkillEligible({
      dateOfBirth: row.dateOfBirth,
      roleInHousehold: row.householdMember?.roleInHousehold ?? null,
    }),
  };
}

/**
 * Update a student's skill level when the coach teaches that series and the
 * student is enrolled (active or waitlist). Adults only.
 */
export async function setStudentSkillLevelAsCoach(input: {
  studentPersonId: string;
  classSeriesId: string;
  skillLevel: string | null;
}) {
  const { person, allowedClubIds } = await requireCoach();
  assertNotSystem(input.studentPersonId);

  const parsed = CoachSkillLevelInputSchema.parse({
    studentPersonId: input.studentPersonId,
    classSeriesId: input.classSeriesId,
    skillLevel: input.skillLevel ?? "",
  });

  const eligibility = await getStudentEligibility(parsed.studentPersonId);
  if (!eligibility.adultSkillEligible) {
    throw new Error(
      "Under-18 students use medal levels, not skill levels. Set their medal instead.",
    );
  }

  await assertCoachCanEditStudentInSeries(
    person.id,
    parsed.classSeriesId,
    parsed.studentPersonId,
    allowedClubIds,
  );

  await changeStudentSkillLevel({
    studentPersonId: parsed.studentPersonId,
    toLevel: parsed.skillLevel,
    changedByPersonId: person.id,
    changedByDisplayName:
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      undefined,
    reason: "coach_edit",
  });

  revalidatePath(`/coach/classes/${parsed.classSeriesId}`);
  revalidatePath(
    `/coach/classes/${parsed.classSeriesId}/students/${parsed.studentPersonId}`,
  );
  revalidatePath("/portal/family");
}

/**
 * Update a minor student's medal level (workbook replacement).
 */
export async function setStudentMedalLevelAsCoach(input: {
  studentPersonId: string;
  classSeriesId: string;
  medalLevel: string | null;
}) {
  const { person, allowedClubIds } = await requireCoach();
  assertNotSystem(input.studentPersonId);

  const parsed = CoachMedalLevelInputSchema.parse({
    studentPersonId: input.studentPersonId,
    classSeriesId: input.classSeriesId,
    medalLevel: input.medalLevel ?? "",
  });

  const eligibility = await getStudentEligibility(parsed.studentPersonId);
  if (!eligibility.medalEligible) {
    throw new Error(
      "Adults use skill levels, not medal levels. Set their skill level instead.",
    );
  }

  await assertCoachCanEditStudentInSeries(
    person.id,
    parsed.classSeriesId,
    parsed.studentPersonId,
    allowedClubIds,
  );

  await changeStudentMedalLevel({
    studentPersonId: parsed.studentPersonId,
    toLevel: parsed.medalLevel as MedalLevel | null,
    changedByPersonId: person.id,
    changedByDisplayName:
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      undefined,
    reason: "coach_edit",
  });

  revalidatePath(`/coach/classes/${parsed.classSeriesId}`);
  revalidatePath(
    `/coach/classes/${parsed.classSeriesId}/students/${parsed.studentPersonId}`,
  );
  revalidatePath("/portal/family");
  revalidatePath("/admin/medals");
}
