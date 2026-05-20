"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCoachAccess } from "@/lib/auth/require-coach-access";

const StaffCoachProfessionalSchema = z.object({
  bio: z.string().trim().optional().transform((v) => (v === "" || v == null ? null : v)),
  photoUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
});

const ZzpCoachProfessionalSchema = z.object({
  businessName: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  vatNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
});

export type CoachProfessionalResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateStaffCoachProfessional(
  formData: FormData,
): Promise<CoachProfessionalResult> {
  const { person } = await requireCoachAccess();

  if (!person.coach?.isActive) {
    return { ok: false, error: "No active staff coach profile." };
  }

  const parsed = StaffCoachProfessionalSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  await prisma.coach.update({
    where: { personId: person.id },
    data: {
      bio: parsed.data.bio,
      photoUrl: parsed.data.photoUrl,
    },
  });

  revalidatePath("/coach/profile/professional");
  return { ok: true };
}

export async function updateZzpCoachProfessional(
  formData: FormData,
): Promise<CoachProfessionalResult> {
  const { person } = await requireCoachAccess();

  if (!person.zzpCoach?.isActive) {
    return { ok: false, error: "No active ZZP coach profile." };
  }

  const parsed = ZzpCoachProfessionalSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  await prisma.zzpCoach.update({
    where: { personId: person.id },
    data: {
      businessName: parsed.data.businessName,
      vatNumber: parsed.data.vatNumber,
    },
  });

  revalidatePath("/coach/profile/professional");
  return { ok: true };
}
