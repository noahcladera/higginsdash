"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { savedRedirectPath } from "@/lib/feedback/saved-flash";
import type { SimpleActionResult } from "@/lib/feedback/types";

const SlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SchoolSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(SlugRegex, "Slug must be lowercase, digits, and hyphens only"),
  name: z.string().trim().min(1).max(120),
  coachArriveAtHubMinutes: z.coerce.number().int().min(0).max(240),
  notes: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const t = v.trim();
      return t === "" ? null : t;
    }),
});

/**
 * Create a pickup school. Slug uniqueness is enforced at the DB layer;
 * a collision surfaces as a friendly error back to the form.
 */
export async function createSchool(formData: FormData) {
  await requireAdmin();
  const parsed = SchoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const data = parsed.data;

  const created = await prisma.school.create({ data });

  revalidatePath("/admin/schools");
  redirect(savedRedirectPath(`/admin/schools/${created.id}`));
}

const UpdateSchema = SchoolSchema.extend({ schoolId: z.string().uuid() });

export async function updateSchool(formData: FormData): Promise<SimpleActionResult> {
  await requireAdmin();
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { schoolId, ...data } = parsed.data;

  try {
    await prisma.school.update({
      where: { id: schoolId },
      data,
    });
  } catch {
    return { ok: false, error: "Could not save school — try again." };
  }

  revalidatePath("/admin/schools");
  revalidatePath(`/admin/schools/${schoolId}`);
  return { ok: true, message: "School saved" };
}

const ArchiveSchema = z.object({
  schoolId: z.string().uuid(),
  archive: z.enum(["archive", "unarchive"]),
});

/**
 * Archive / unarchive a school. Same pattern as venue archival: archiving
 * hides the school from the class-creation picker but preserves the
 * historical link on existing ClassSeries rows.
 */
export async function archiveSchool(formData: FormData) {
  await requireAdmin();
  const parsed = ArchiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input");
  }
  const { schoolId, archive } = parsed.data;
  await prisma.school.update({
    where: { id: schoolId },
    data: {
      isActive: archive === "unarchive",
      archivedAt: archive === "archive" ? new Date() : null,
    },
  });
  revalidatePath("/admin/schools");
  revalidatePath(`/admin/schools/${schoolId}`);
}
