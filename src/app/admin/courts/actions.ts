"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

const CourtSurfaceSchema = z.enum([
  "clay",
  "grass",
  "multi_use",
  "hard",
  "indoor_hard",
  "other",
]);
const CourtTierSchema = z.enum([
  "premium",
  "standard",
  "practice_only",
  "walk_on_only",
]);
const OptionalTextSchema = z
  .string()
  .max(2000)
  .transform((v) => (v.trim() === "" ? null : v.trim()))
  .optional()
  .nullable();

const CourtFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  displayOrder: z.coerce.number().int().min(0).max(999),
  surface: CourtSurfaceSchema,
  qualityTier: CourtTierSchema,
  isBookable: z
    .union([z.literal("on"), z.literal("true"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
  notes: OptionalTextSchema,
});

const CreateSchema = CourtFormSchema.extend({
  clubId: z.string().uuid(),
});

const UpdateSchema = CourtFormSchema.extend({
  courtId: z.string().uuid(),
});

const ArchiveSchema = z.object({
  courtId: z.string().uuid(),
  archive: z.enum(["archive", "unarchive"]),
});

function parseDbUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err != null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

function revalidateCourts() {
  revalidatePath("/admin/courts");
  revalidatePath("/admin/bookings");
}

export async function createCourt(formData: FormData) {
  await requireAdmin();
  const parsed = CreateSchema.safeParse({
    clubId: formData.get("clubId"),
    name: formData.get("name"),
    displayOrder: formData.get("displayOrder"),
    surface: formData.get("surface"),
    qualityTier: formData.get("qualityTier"),
    isBookable: formData.get("isBookable") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const club = await prisma.club.findUnique({
    where: { id: parsed.data.clubId },
    select: { id: true, isActive: true },
  });
  if (!club || !club.isActive) {
    throw new Error("Selected club is not available");
  }

  try {
    await prisma.court.create({
      data: {
        clubId: parsed.data.clubId,
        name: parsed.data.name,
        displayOrder: parsed.data.displayOrder,
        surface: parsed.data.surface,
        qualityTier: parsed.data.qualityTier,
        isBookable: parsed.data.isBookable,
        notes: parsed.data.notes ?? undefined,
      },
    });
  } catch (err) {
    if (parseDbUniqueError(err)) {
      throw new Error("A court with this name already exists at that club");
    }
    throw err;
  }

  revalidateCourts();
}

export async function updateCourt(formData: FormData) {
  await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    courtId: formData.get("courtId"),
    name: formData.get("name"),
    displayOrder: formData.get("displayOrder"),
    surface: formData.get("surface"),
    qualityTier: formData.get("qualityTier"),
    isBookable: formData.get("isBookable") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const existing = await prisma.court.findUnique({
    where: { id: parsed.data.courtId },
    select: { id: true },
  });
  if (!existing) throw new Error("Court not found");

  try {
    await prisma.court.update({
      where: { id: parsed.data.courtId },
      data: {
        name: parsed.data.name,
        displayOrder: parsed.data.displayOrder,
        surface: parsed.data.surface,
        qualityTier: parsed.data.qualityTier,
        isBookable: parsed.data.isBookable,
        notes: parsed.data.notes ?? undefined,
      },
    });
  } catch (err) {
    if (parseDbUniqueError(err)) {
      throw new Error("A court with this name already exists at that club");
    }
    throw err;
  }

  revalidateCourts();
}

export async function archiveCourt(formData: FormData) {
  await requireAdmin();
  const parsed = ArchiveSchema.safeParse({
    courtId: formData.get("courtId"),
    archive: formData.get("archive"),
  });
  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  await prisma.court.update({
    where: { id: parsed.data.courtId },
    data: { isActive: parsed.data.archive !== "archive" },
  });

  revalidateCourts();
}
