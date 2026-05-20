"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthedPerson } from "@/lib/auth/require-authed-person";

const GenderEnum = z.enum(["male", "female", "other", "prefer_not_to_say"]);

const ProfilePatchSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  phone: z.string().trim().min(5, "Phone is required").max(40),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Date of birth is required"),
  gender: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine(
      (v) => v === null || GenderEnum.safeParse(v).success,
      "Invalid gender",
    ),
  addressLine1: z
    .string()
    .trim()
    .min(1, "Address line 1 is required")
    .max(200),
  addressLine2: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  postalCode: z
    .string()
    .trim()
    .min(2, "Postal code is required")
    .max(20),
  city: z
    .string()
    .trim()
    .min(1, "City is required")
    .max(100),
  country: z.string().trim().min(1).max(2).default("NL"),
  emergencyContactName: z
    .string()
    .trim()
    .min(1, "Emergency contact name is required")
    .max(200),
  emergencyContactPhone: z
    .string()
    .trim()
    .min(5, "Emergency contact phone is required")
    .max(40),
  emergencyContactRelationship: z
    .string()
    .trim()
    .min(1, "Emergency contact relationship is required")
    .max(80),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

async function updateMyProfileCore(
  formData: FormData,
  revalidatePaths: string[],
): Promise<UpdateProfileResult> {
  const { person } = await requireAuthedPerson();

  const parsed = ProfilePatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  const d = new Date(data.dateOfBirth);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Date of birth is not a valid date." };
  }
  const dob: Date = d;

  await prisma.person.update({
    where: { id: person.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      dateOfBirth: dob,
      gender: data.gender as
        | "male"
        | "female"
        | "other"
        | "prefer_not_to_say"
        | null,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      postalCode: data.postalCode,
      city: data.city,
      country: data.country,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
      emergencyContactRelationship: data.emergencyContactRelationship,
    },
  });

  for (const p of revalidatePaths) {
    revalidatePath(p);
  }
  return { ok: true };
}

export async function updateMyProfilePortal(
  formData: FormData,
): Promise<UpdateProfileResult> {
  return updateMyProfileCore(formData, ["/portal/profile"]);
}

export async function updateMyProfileCoach(
  formData: FormData,
): Promise<UpdateProfileResult> {
  return updateMyProfileCore(formData, ["/coach/profile"]);
}

export async function updateMyProfileAdmin(
  formData: FormData,
): Promise<UpdateProfileResult> {
  return updateMyProfileCore(formData, ["/admin/profile"]);
}
