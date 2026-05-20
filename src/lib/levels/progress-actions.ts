"use server";

/**
 * Coach-side server actions for the per-level rubric:
 *
 *   - {@link toggleCriterion}   tick / un-tick one criterion for a student.
 *   - {@link promoteStudent}    one-click "move them up to the next level".
 *
 * Both actions enforce the same scope as the existing
 * `setStudentSkillLevelAsCoach`: the caller must coach a series the
 * student is actively enrolled in. Promotion writes through the shared
 * {@link changeStudentSkillLevel} pipeline so the parent notification
 * + StudentSkillHistory row land for free.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
import { classSeriesClubScope } from "@/lib/coach/club-scope";
import { changeStudentSkillLevel } from "@/lib/levels/student-level-pipeline";
import {
  formatSkillLevel,
  getNextSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";

function assertNotSystem(id: string) {
  if (id === SYSTEM_PERSON_ID) {
    throw new Error("Cannot modify the system placeholder.");
  }
}

const ToggleCriterionSchema = z.object({
  studentPersonId: z.string().uuid(),
  classSeriesId: z.string().uuid(),
  criterionId: z.string().uuid(),
  achieved: z.union([z.literal("true"), z.literal("false")]).transform((v) => v === "true"),
});

/**
 * Verify the caller coaches a series this student is currently in. Returns
 * the coach person and the series id when allowed; throws otherwise. Used
 * by both `toggleCriterion` and `promoteStudent` so the security check
 * stays in one place.
 */
async function ensureCoachOwnsStudent(input: {
  studentPersonId: string;
  classSeriesId: string;
}) {
  const { person, allowedClubIds } = await requireCoach();
  assertNotSystem(input.studentPersonId);
  const clubScope = classSeriesClubScope(allowedClubIds);
  const ok = await prisma.classSeries.findFirst({
    where: {
      id: input.classSeriesId,
      coaches: { some: { coachPersonId: person.id } },
      ...clubScope,
      enrollments: {
        some: {
          studentPersonId: input.studentPersonId,
          status: { in: ["active", "waitlist"] },
        },
      },
    },
    select: { id: true },
  });
  if (!ok) {
    throw new Error("You can only update levels for students in your classes.");
  }
  return { person };
}

export async function toggleCriterion(formData: FormData) {
  const parsed = ToggleCriterionSchema.parse({
    studentPersonId: formData.get("studentPersonId"),
    classSeriesId: formData.get("classSeriesId"),
    criterionId: formData.get("criterionId"),
    achieved: formData.get("achieved"),
  });

  const { person } = await ensureCoachOwnsStudent({
    studentPersonId: parsed.studentPersonId,
    classSeriesId: parsed.classSeriesId,
  });

  // Sanity-check the criterion exists and isn't archived. We allow ticking
  // criteria for *any* level (a coach who's still working through old
  // material shouldn't be blocked) — the parent UI scopes display by
  // current level, not by what's stored.
  const criterion = await prisma.levelCriterion.findFirst({
    where: { id: parsed.criterionId, archivedAt: null },
    select: { id: true },
  });
  if (!criterion) {
    throw new Error("That criterion is no longer available.");
  }

  if (parsed.achieved) {
    await prisma.studentLevelProgress.upsert({
      where: {
        studentId_criterionId: {
          studentId: parsed.studentPersonId,
          criterionId: parsed.criterionId,
        },
      },
      create: {
        studentId: parsed.studentPersonId,
        criterionId: parsed.criterionId,
        achievedByPersonId: person.id,
      },
      update: {
        achievedAt: new Date(),
        achievedByPersonId: person.id,
      },
    });
  } else {
    await prisma.studentLevelProgress.deleteMany({
      where: {
        studentId: parsed.studentPersonId,
        criterionId: parsed.criterionId,
      },
    });
  }

  revalidatePath(
    `/coach/classes/${parsed.classSeriesId}/students/${parsed.studentPersonId}`,
  );
  revalidatePath("/portal/family");
}

const PromoteStudentSchema = z.object({
  studentPersonId: z.string().uuid(),
  classSeriesId: z.string().uuid(),
});

/**
 * Move a student to the next level on their ladder. Driven by the
 * "Promote to <next level>" CTA shown when every live criterion for
 * the student's current level has been ticked.
 */
export async function promoteStudent(formData: FormData) {
  const parsed = PromoteStudentSchema.parse({
    studentPersonId: formData.get("studentPersonId"),
    classSeriesId: formData.get("classSeriesId"),
  });

  const { person } = await ensureCoachOwnsStudent({
    studentPersonId: parsed.studentPersonId,
    classSeriesId: parsed.classSeriesId,
  });

  const student = await prisma.student.findUnique({
    where: { personId: parsed.studentPersonId },
    select: { skillLevel: true },
  });
  if (!student) {
    throw new Error("This person is not a student.");
  }
  const next = getNextSkillLevel(student.skillLevel as SkillLevelValue | null);
  if (!next) {
    throw new Error(
      `${formatSkillLevel(student.skillLevel)} is the top of the ladder; no level to promote to.`,
    );
  }

  await changeStudentSkillLevel({
    studentPersonId: parsed.studentPersonId,
    toLevel: next,
    changedByPersonId: person.id,
    changedByDisplayName:
      [person.firstName, person.lastName].filter(Boolean).join(" ") ||
      undefined,
    reason: "coach_promote",
  });

  revalidatePath(`/coach/classes/${parsed.classSeriesId}`);
  revalidatePath(
    `/coach/classes/${parsed.classSeriesId}/students/${parsed.studentPersonId}`,
  );
  revalidatePath("/portal/family");
}
