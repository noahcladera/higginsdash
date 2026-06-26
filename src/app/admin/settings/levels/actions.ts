"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { SimpleActionResult } from "@/lib/feedback/types";

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

const UpdateLevelContentSchema = z.object({
  skillLevel: SkillLevelEnum,
  title: z.string().min(1).max(200),
  shortDescription: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v?.trim() === "" ? undefined : v)),
  longDescription: z.string().max(20000).default(""),
  howToGraduate: z
    .string()
    .max(20000)
    .optional()
    .transform((v) => (v?.trim() === "" ? null : v?.trim() ?? null)),
  sortOrder: z.coerce.number().int().min(0).max(999),
  videoUrl: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v?.trim() === "" ? null : v?.trim())),
});

export async function updateLevelContent(formData: FormData): Promise<SimpleActionResult> {
  const { person } = await requireAdmin();

  let parsed;
  try {
    parsed = UpdateLevelContentSchema.parse({
      skillLevel: formData.get("skillLevel"),
      title: formData.get("title"),
      shortDescription: formData.get("shortDescription") ?? undefined,
      longDescription: formData.get("longDescription") ?? "",
      howToGraduate: formData.get("howToGraduate") ?? undefined,
      sortOrder: formData.get("sortOrder"),
      videoUrl: formData.get("videoUrl") ?? undefined,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    return { ok: false, error: "Invalid input" };
  }

  try {
    await prisma.levelContent.update({
      where: { skillLevel: parsed.skillLevel },
      data: {
        title: parsed.title,
        shortDescription: parsed.shortDescription ?? null,
        longDescription: parsed.longDescription,
        howToGraduate: parsed.howToGraduate,
        sortOrder: parsed.sortOrder,
        videoUrl: parsed.videoUrl,
        updatedByPersonId: person.id,
      },
    });
  } catch {
    return { ok: false, error: "Could not save level — try again." };
  }

  revalidatePath("/levels/kids");
  revalidatePath("/levels/adults");
  revalidatePath(`/levels/${parsed.skillLevel}`);
  revalidatePath("/admin/settings/levels/kids");
  revalidatePath("/admin/settings/levels/adults");
  revalidatePath(`/admin/settings/levels/${parsed.skillLevel}`);
  return { ok: true, message: "Level saved" };
}

// ---------------------------------------------------------------------
// Level criteria CRUD (per-level rubric checklist).
//
// The criteria drive both the coach's per-student "tick to graduate"
// checklist and the parent-facing rubric on /levels/[skillLevel]. We
// keep them admin-only — coaches can't add/remove items in the rubric,
// only tick them per student.
// ---------------------------------------------------------------------

const CreateCriterionSchema = z.object({
  skillLevel: SkillLevelEnum,
  label: z.string().trim().min(1).max(200),
  description: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v?.trim() === "" ? null : v?.trim() ?? null)),
});

const UpdateCriterionSchema = z.object({
  id: z.string().uuid(),
  skillLevel: SkillLevelEnum,
  label: z.string().trim().min(1).max(200),
  description: z
    .string()
    .max(2000)
    .optional()
    .transform((v) => (v?.trim() === "" ? null : v?.trim() ?? null)),
  sortOrder: z.coerce.number().int().min(0).max(999),
});

const CriterionIdSchema = z.object({
  id: z.string().uuid(),
  skillLevel: SkillLevelEnum,
});

function revalidateCriteriaPaths(skillLevel: string) {
  revalidatePath(`/admin/settings/levels/${skillLevel}`);
  revalidatePath(`/levels/${skillLevel}`);
  revalidatePath("/portal/family");
}

export async function createLevelCriterion(formData: FormData) {
  await requireAdmin();
  const parsed = CreateCriterionSchema.parse({
    skillLevel: formData.get("skillLevel"),
    label: formData.get("label"),
    description: formData.get("description") ?? undefined,
  });

  // Tail-of-list ordering — admins can drag to reorder later (or just
  // bump sort_order via the edit form for now).
  const last = await prisma.levelCriterion.findFirst({
    where: { skillLevel: parsed.skillLevel },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextSort = (last?.sortOrder ?? -1) + 1;

  await prisma.levelCriterion.create({
    data: {
      skillLevel: parsed.skillLevel,
      label: parsed.label,
      description: parsed.description,
      sortOrder: nextSort,
    },
  });

  revalidateCriteriaPaths(parsed.skillLevel);
}

export async function updateLevelCriterion(formData: FormData) {
  await requireAdmin();
  const parsed = UpdateCriterionSchema.parse({
    id: formData.get("id"),
    skillLevel: formData.get("skillLevel"),
    label: formData.get("label"),
    description: formData.get("description") ?? undefined,
    sortOrder: formData.get("sortOrder"),
  });

  await prisma.levelCriterion.update({
    where: { id: parsed.id },
    data: {
      label: parsed.label,
      description: parsed.description,
      sortOrder: parsed.sortOrder,
    },
  });

  revalidateCriteriaPaths(parsed.skillLevel);
}

export async function archiveLevelCriterion(formData: FormData) {
  await requireAdmin();
  const parsed = CriterionIdSchema.parse({
    id: formData.get("id"),
    skillLevel: formData.get("skillLevel"),
  });

  await prisma.levelCriterion.update({
    where: { id: parsed.id },
    data: { archivedAt: new Date() },
  });

  revalidateCriteriaPaths(parsed.skillLevel);
}

export async function unarchiveLevelCriterion(formData: FormData) {
  await requireAdmin();
  const parsed = CriterionIdSchema.parse({
    id: formData.get("id"),
    skillLevel: formData.get("skillLevel"),
  });

  await prisma.levelCriterion.update({
    where: { id: parsed.id },
    data: { archivedAt: null },
  });

  revalidateCriteriaPaths(parsed.skillLevel);
}
