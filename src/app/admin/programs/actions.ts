"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { savedRedirectPath } from "@/lib/feedback/saved-flash";

/**
 * Update the parent-facing presentation of a program: the public
 * description and the cover image shown at the top of the program
 * page.
 *
 * Narrow on purpose — the schedule (class series), ages, and pricing
 * still live in the class-series flow. This action is just the
 * "storefront" card for a program.
 */
const UpdateProgramPresentationSchema = z.object({
  id: z.string().uuid(),
  descriptionPublic: z.string().trim().max(4000).optional().or(z.literal("")),
  coverImageUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .optional()
    .or(z.literal("")),
  coverImageFocusY: z.coerce.number().int().min(0).max(100).default(50),
});

export type UpdateProgramPresentationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateProgramPresentation(
  formData: FormData,
): Promise<UpdateProgramPresentationResult> {
  await requireAdmin();

  const parsed = UpdateProgramPresentationSchema.safeParse({
    id: formData.get("id") ?? "",
    descriptionPublic: formData.get("descriptionPublic") ?? "",
    coverImageUrl: formData.get("coverImageUrl") ?? "",
    coverImageFocusY: formData.get("coverImageFocusY") ?? "50",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Could not save those changes — check the fields.",
    };
  }

  await prisma.program.update({
    where: { id: parsed.data.id },
    data: {
      descriptionPublic: parsed.data.descriptionPublic
        ? parsed.data.descriptionPublic
        : null,
      coverImageUrl: parsed.data.coverImageUrl
        ? parsed.data.coverImageUrl
        : null,
      coverImageFocusY: parsed.data.coverImageFocusY,
    },
  });

  revalidateProgramSurfaces();
  return { ok: true };
}

const ProgramTargetAudienceSchema = z.enum(["kids", "adults", "mixed"]);
const ClassTypeSchema = z.enum([
  "group_lesson",
  "high_performance",
  "school_pickup",
  "school_onsite",
  "private_individual",
  "private_small_group",
  "camp",
  "trial",
  "event",
]);

const CreateProgramSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  targetAudience: ProgramTargetAudienceSchema,
  defaultClassType: ClassTypeSchema,
  slug: z.string().trim().max(120).optional().or(z.literal("")),
});

export type CreateProgramFormState =
  | { ok: true }
  | { ok: false; error: string };

export const initialCreateProgramFormState: CreateProgramFormState = {
  ok: true,
};

function slugBaseFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length > 0 ? base : "program";
}

async function uniqueProgramSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    const clash = await prisma.program.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

function revalidateProgramSurfaces() {
  revalidatePath("/admin/programs");
  revalidatePath("/portal/programs");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/classes/new");
  revalidatePath("/admin/events/new");
}

/**
 * Create a catalog program (admin). On success redirects to its
 * presentation edit page. For {@link useActionState} on the new-program form.
 */
export async function createProgramForm(
  _prev: CreateProgramFormState,
  formData: FormData,
): Promise<CreateProgramFormState> {
  await requireAdmin();

  const parsed = CreateProgramSchema.safeParse({
    name: formData.get("name") ?? "",
    targetAudience: formData.get("targetAudience") ?? "",
    defaultClassType: formData.get("defaultClassType") ?? "",
    slug: formData.get("slug") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Could not create — check the fields.",
    };
  }

  const slugInput = parsed.data.slug?.trim();
  const base = slugInput
    ? slugBaseFromName(slugInput)
    : slugBaseFromName(parsed.data.name);
  const slug = await uniqueProgramSlug(base);

  const maxOrder = await prisma.program.aggregate({
    _max: { displayOrder: true },
  });
  const displayOrder = (maxOrder._max.displayOrder ?? 0) + 1;

  await prisma.program.create({
    data: {
      name: parsed.data.name.trim(),
      slug,
      targetAudience: parsed.data.targetAudience,
      defaultClassType: parsed.data.defaultClassType,
      displayOrder,
      isActive: true,
      isPubliclyListed: true,
    },
  });

  revalidateProgramSurfaces();
  redirect(savedRedirectPath(`/admin/programs/${slug}`));
}

export type DeleteProgramResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Delete a program only when it has no class series (FK from series).
 */
export async function deleteProgram(
  programId: string,
): Promise<DeleteProgramResult> {
  await requireAdmin();

  const idParse = z.string().uuid().safeParse(programId);
  if (!idParse.success) {
    return { ok: false, error: "Invalid program id." };
  }

  const row = await prisma.program.findUnique({
    where: { id: idParse.data },
    select: {
      _count: { select: { classSeries: true } },
    },
  });
  if (!row) {
    return { ok: false, error: "Program not found." };
  }
  if (row._count.classSeries > 0) {
    return {
      ok: false,
      error:
        "This program still has class series attached. Remove or archive those series under Classes before deleting the program.",
    };
  }

  await prisma.program.delete({ where: { id: idParse.data } });
  revalidateProgramSurfaces();
  return { ok: true };
}
