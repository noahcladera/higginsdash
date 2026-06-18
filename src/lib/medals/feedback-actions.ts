"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SeriesFeedbackVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
import { classSeriesClubScope } from "@/lib/coach/club-scope";

const UpsertFeedbackSchema = z.object({
  enrollmentId: z.string().uuid(),
  body: z
    .string()
    .max(2000)
    .transform((v) => v.trim()),
  visibility: z.enum(["coach_only", "parent_visible"]),
});

async function assertCoachOwnsEnrollment(
  coachPersonId: string,
  enrollmentId: string,
  allowedClubIds: string[] | null,
) {
  const clubScope = classSeriesClubScope(allowedClubIds);
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      classSeries: {
        coaches: { some: { coachPersonId } },
        ...clubScope,
      },
    },
    select: {
      id: true,
      classSeriesId: true,
      studentPersonId: true,
    },
  });
  if (!enrollment) {
    throw new Error("You can only add feedback for students in your classes.");
  }
  return enrollment;
}

export async function upsertSeriesFeedback(input: {
  enrollmentId: string;
  body: string;
  visibility: SeriesFeedbackVisibility;
}) {
  const { person, allowedClubIds } = await requireCoach();
  const parsed = UpsertFeedbackSchema.parse(input);
  const enrollment = await assertCoachOwnsEnrollment(
    person.id,
    parsed.enrollmentId,
    allowedClubIds,
  );

  if (parsed.body.length < 1) {
    await prisma.studentSeriesFeedback.deleteMany({
      where: { enrollmentId: parsed.enrollmentId },
    });
  } else {
    await prisma.studentSeriesFeedback.upsert({
      where: { enrollmentId: parsed.enrollmentId },
      create: {
        enrollmentId: parsed.enrollmentId,
        body: parsed.body,
        visibility: parsed.visibility,
        authorPersonId: person.id,
      },
      update: {
        body: parsed.body,
        visibility: parsed.visibility,
        authorPersonId: person.id,
      },
    });
  }

  revalidatePath(`/coach/classes/${enrollment.classSeriesId}`);
  revalidatePath(
    `/coach/classes/${enrollment.classSeriesId}/students/${enrollment.studentPersonId}`,
  );
  revalidatePath("/portal/classes");
}

export async function getSeriesFeedbackForCoach(enrollmentId: string) {
  const { person, allowedClubIds } = await requireCoach();
  await assertCoachOwnsEnrollment(person.id, enrollmentId, allowedClubIds);
  return prisma.studentSeriesFeedback.findUnique({
    where: { enrollmentId },
    select: {
      body: true,
      visibility: true,
      updatedAt: true,
    },
  });
}

export async function getParentVisibleFeedbackForStudent(
  studentPersonId: string,
) {
  const rows = await prisma.studentSeriesFeedback.findMany({
    where: {
      visibility: "parent_visible",
      enrollment: {
        studentPersonId,
        status: { in: ["active", "waitlist"] },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      body: true,
      updatedAt: true,
      enrollment: {
        select: {
          classSeries: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    body: r.body,
    updatedAt: r.updatedAt,
    seriesName: r.enrollment.classSeries.name,
  }));
}
