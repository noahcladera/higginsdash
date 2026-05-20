"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";

const UpdateSchema = z.object({
  courtId: z.string().uuid(),
  name: z.string().min(1).max(100),
  displayOrder: z.coerce.number().int().min(0).max(999),
  isBookable: z
    .union([z.literal("on"), z.literal("true"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
  isLit: z
    .union([z.literal("on"), z.literal("true"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
  notes: z
    .string()
    .max(2000)
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .optional()
    .nullable(),
});

export async function updateCourt(formData: FormData) {
  await requireAdmin();
  const parsed = UpdateSchema.safeParse({
    courtId: formData.get("courtId"),
    name: formData.get("name"),
    displayOrder: formData.get("displayOrder"),
    isBookable: formData.get("isBookable") ?? undefined,
    isLit: formData.get("isLit") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  await prisma.court.update({
    where: { id: parsed.data.courtId },
    data: {
      name: parsed.data.name,
      displayOrder: parsed.data.displayOrder,
      isBookable: parsed.data.isBookable,
      isLit: parsed.data.isLit,
      notes: parsed.data.notes ?? undefined,
    },
  });

  revalidatePath("/admin/courts");
  revalidatePath("/admin/bookings");
}
