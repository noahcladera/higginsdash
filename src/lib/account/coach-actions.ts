"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCoachAccess } from "@/lib/auth/require-coach-access";

/**
 * A photo URL must be an https URL on our own Supabase Storage host (that's
 * where `uploadImage` writes). This blocks `javascript:` / `data:` and
 * arbitrary external URLs from being stored and later rendered.
 */
function isAllowedPhotoUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl) {
    try {
      if (parsed.host !== new URL(supabaseUrl).host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const StaffCoachProfessionalSchema = z.object({
  bio: z.string().trim().optional().transform((v) => (v === "" || v == null ? null : v)),
  photoUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v))
    .refine((v) => v == null || isAllowedPhotoUrl(v), "Invalid photo URL."),
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
