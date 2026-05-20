"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { requireCoach } from "@/lib/auth/require-coach";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";
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

/**
 * Update a student's skill level when the coach teaches that series and the
 * student is enrolled (active or waitlist).
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

  const clubScope = classSeriesClubScope(allowedClubIds);
  const ok = await prisma.classSeries.findFirst({
    where: {
      id: parsed.classSeriesId,
      coaches: { some: { coachPersonId: person.id } },
      ...clubScope,
      enrollments: {
        some: {
          studentPersonId: parsed.studentPersonId,
          status: { in: ["active", "waitlist"] },
        },
      },
    },
    select: { id: true },
  });

  if (!ok) {
    throw new Error("You can only update levels for students in your classes.");
  }

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
