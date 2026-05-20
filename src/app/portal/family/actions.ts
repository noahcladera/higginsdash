"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth/require-member";
import { isGuardianOf } from "@/lib/portal/queries";

/**
 * Subset of fields a parent is allowed to edit on their child's profile.
 *
 * Skill level is intentionally NOT here — coaches/admins decide that.
 * Notes / medical / enrollment status stay admin-side too. Parents can
 * keep day-to-day info accurate (school, emergency contact, basic bio).
 */
const ChildPatchSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  school: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactName: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactRelationship: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
})
.superRefine((val, ctx) => {
  if (
    (val.emergencyContactName || val.emergencyContactPhone) &&
    !val.emergencyContactRelationship
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emergencyContactRelationship"],
      message: "Relationship is required when an emergency contact is set.",
    });
  }
});

export type UpdateChildResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Parent-initiated edit of a child profile. Refuses unless the caller
 * shares a household with the target child as an `adult`.
 */
export async function updateChildProfile(
  childPersonId: string,
  formData: FormData,
): Promise<UpdateChildResult> {
  const { person } = await requireMember();

  const isParent = await isGuardianOf(person.id, childPersonId);
  if (!isParent) {
    return {
      ok: false,
      error: "You don't have permission to edit this child.",
    };
  }

  const raw = Object.fromEntries(formData);
  const parsed = ChildPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  // Validate dob shape if provided. Browser <input type="date"> gives YYYY-MM-DD.
  let dob: Date | null = null;
  if (data.dateOfBirth) {
    const d = new Date(data.dateOfBirth);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Date of birth is not a valid date." };
    }
    dob = d;
  }

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: childPersonId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: dob,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        emergencyContactRelationship: data.emergencyContactRelationship,
      },
    });
    // Only update the Student row if it exists; child without a Student
    // row just means they aren't taking lessons yet.
    const student = await tx.student.findUnique({
      where: { personId: childPersonId },
    });
    if (student) {
      await tx.student.update({
        where: { personId: childPersonId },
        data: { school: data.school },
      });
    }
  });

  revalidatePath("/portal/family");
  return { ok: true };
}

const AddChildSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : null)),
  dateOfBirth: z.string().trim().min(1, "Date of birth is required"),
  school: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactName: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  emergencyContactRelationship: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
})
.superRefine((val, ctx) => {
  if (
    (val.emergencyContactName || val.emergencyContactPhone) &&
    !val.emergencyContactRelationship
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emergencyContactRelationship"],
      message: "Relationship is required when an emergency contact is set.",
    });
  }
});

export type AddChildResult =
  | { ok: true; childId: string }
  | { ok: false; error: string };

/**
 * Parent-initiated "add another child" from the My family page.
 *
 * Adds a new `Person` row + `HouseholdMember(role=child)` for the
 * caller's household. Children don't get a Supabase auth account — they
 * only get a Student row later, when a coach signs them up for lessons.
 *
 * Lastname falls back to the parent's lastname for the common case where
 * siblings share a surname.
 */
export async function addChildToHousehold(
  formData: FormData,
): Promise<AddChildResult> {
  const { person, householdId } = await requireMember();
  if (!householdId) {
    return {
      ok: false,
      error: "You're not in a household yet. Contact the office.",
    };
  }

  const me = await prisma.householdMember.findUnique({
    where: { personId: person.id },
    select: { roleInHousehold: true },
  });
  if (!me || me.roleInHousehold !== "adult") {
    return {
      ok: false,
      error: "Only adults in the household can add children.",
    };
  }

  const raw = Object.fromEntries(formData);
  const parsed = AddChildSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return { ok: false, error: "Date of birth is not a valid date." };
  }

  const childId = randomUUID();
  const fallbackLastName = person.lastName ?? "";

  try {
    await prisma.$transaction(async (tx) => {
      const household = await tx.household.findUnique({
        where: { id: householdId },
        select: { country: true },
      });
      await tx.person.create({
        data: {
          id: childId,
          firstName: data.firstName,
          lastName: data.lastName ?? fallbackLastName,
          dateOfBirth: dob,
          country: household?.country ?? "NL",
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
          emergencyContactRelationship: data.emergencyContactRelationship,
        },
      });
      await tx.householdMember.create({
        data: {
          householdId,
          personId: childId,
          roleInHousehold: "child",
        },
      });
      if (data.school) {
        await tx.student.create({
          data: {
            personId: childId,
            school: data.school,
          },
        });
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not add child.";
    return { ok: false, error: msg };
  }

  revalidatePath("/portal/family");
  revalidatePath("/portal");
  return { ok: true, childId };
}
