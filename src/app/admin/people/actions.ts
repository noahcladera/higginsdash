"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * Coerces empty strings to undefined so optional fields can be left blank in
 * the form without writing "" into the DB.
 */
const blank = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const PersonInputSchema = z
  .object({
  firstName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "First name is required").max(100)),
  lastName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Last name is required").max(100)),
  dateOfBirth: blank.pipe(
    z
      .union([
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
        z.undefined(),
      ])
      .optional(),
  ),
  phone: blank.pipe(z.string().max(50).optional()),
  gender: blank.pipe(
    z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  ),
  addressLine1: blank.pipe(z.string().max(200).optional()),
  addressLine2: blank.pipe(z.string().max(200).optional()),
  postalCode: blank.pipe(z.string().max(20).optional()),
  city: blank.pipe(z.string().max(100).optional()),
  country: blank.pipe(z.string().max(2).optional()),
  emergencyContactName: blank.pipe(z.string().max(200).optional()),
  emergencyContactPhone: blank.pipe(z.string().max(50).optional()),
  emergencyContactRelationship: blank.pipe(z.string().max(100).optional()),
  notes: blank.pipe(z.string().max(2000).optional()),
  isAdmin: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
  })
  .superRefine((val, ctx) => {
    // Once an admin records an emergency-contact name or phone, the
    // relationship is mandatory — without it the office can't tell who
    // they're calling. This mirrors the portal's profile-completeness
    // rule for adults but stays opt-in for child rows that legitimately
    // have no contact set.
    const hasName =
      val.emergencyContactName != null && val.emergencyContactName !== "";
    const hasPhone =
      val.emergencyContactPhone != null && val.emergencyContactPhone !== "";
    const hasRel =
      val.emergencyContactRelationship != null &&
      val.emergencyContactRelationship !== "";
    if ((hasName || hasPhone) && !hasRel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emergencyContactRelationship"],
        message:
          "Relationship is required whenever an emergency contact is recorded.",
      });
    }
  });

const EmailInputSchema = z.object({
  address: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email("Invalid email address")),
  kind: z.enum(["personal", "work", "other"]).default("personal"),
  isPrimary: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
});

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

const StudentInputSchema = z.object({
  enrollmentStatus: z.enum(["active", "paused", "archived"]),
  school: blank.pipe(z.string().max(200).optional()),
  medicalNotes: blank.pipe(z.string().max(2000).optional()),
});

const SkillLevelInputSchema = z.object({
  /** Empty string means "clear the level" (set to null). */
  skillLevel: z
    .string()
    .transform((v) => (v.trim() === "" ? null : v.trim()))
    .pipe(z.union([SkillLevelEnum, z.null()])),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dateOrNull(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assertNotSystem(id: string) {
  if (id === SYSTEM_PERSON_ID) {
    throw new Error("Cannot modify the system placeholder.");
  }
}

// ---------------------------------------------------------------------------
// Person CRUD
// ---------------------------------------------------------------------------

export async function createPerson(formData: FormData) {
  await requireAdmin();
  const parsed = PersonInputSchema.parse(Object.fromEntries(formData));

  // Person.id has no @default — it's the same UUID as auth.users.id when
  // created via login. For admin-created people there's no auth.users row yet,
  // so we mint a fresh UUID here.
  const created = await prisma.person.create({
    data: {
      id: randomUUID(),
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: dateOrNull(parsed.dateOfBirth),
      gender: parsed.gender ?? null,
      phone: parsed.phone ?? null,
      addressLine1: parsed.addressLine1 ?? null,
      addressLine2: parsed.addressLine2 ?? null,
      postalCode: parsed.postalCode ?? null,
      city: parsed.city ?? null,
      country: parsed.country ?? "NL",
      emergencyContactName: parsed.emergencyContactName ?? null,
      emergencyContactPhone: parsed.emergencyContactPhone ?? null,
      emergencyContactRelationship: parsed.emergencyContactRelationship ?? null,
      notes: parsed.notes ?? null,
      isAdmin: parsed.isAdmin,
    },
    select: { id: true },
  });

  revalidatePath("/admin/people");
  redirect(`/admin/people/${created.id}`);
}

export async function updatePerson(id: string, formData: FormData) {
  const { person: actor } = await requireAdmin();
  assertNotSystem(id);

  const parsed = PersonInputSchema.parse(Object.fromEntries(formData));

  // Safety: don't let an admin remove their own admin flag (would lock
  // themselves out). They can ask another admin to do it.
  const isSelf = actor.id === id;

  await prisma.person.update({
    where: { id },
    data: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      dateOfBirth: dateOrNull(parsed.dateOfBirth),
      gender: parsed.gender ?? null,
      phone: parsed.phone ?? null,
      addressLine1: parsed.addressLine1 ?? null,
      addressLine2: parsed.addressLine2 ?? null,
      postalCode: parsed.postalCode ?? null,
      city: parsed.city ?? null,
      country: parsed.country ?? "NL",
      emergencyContactName: parsed.emergencyContactName ?? null,
      emergencyContactPhone: parsed.emergencyContactPhone ?? null,
      emergencyContactRelationship: parsed.emergencyContactRelationship ?? null,
      notes: parsed.notes ?? null,
      isAdmin: isSelf ? true : parsed.isAdmin,
    },
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
  redirect(`/admin/people/${id}`);
}

export async function archivePerson(id: string) {
  const { person: actor } = await requireAdmin();
  assertNotSystem(id);

  if (actor.id === id) {
    throw new Error("You cannot archive yourself.");
  }

  const before = await prisma.person.findUniqueOrThrow({
    where: { id },
    select: { id: true, archivedAt: true, isAdmin: true },
  });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: { archivedAt: now },
    });
    await recordAudit({
      tx,
      tableName: "people",
      rowId: id,
      action: "update",
      changedByPersonId: actor.id,
      before,
      after: { archivedAt: now.toISOString() },
      changeSource: "admin_console",
    });
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
}

export async function restorePerson(id: string) {
  const { person: actor } = await requireAdmin();
  assertNotSystem(id);

  const before = await prisma.person.findUniqueOrThrow({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: { archivedAt: null },
    });
    await recordAudit({
      tx,
      tableName: "people",
      rowId: id,
      action: "update",
      changedByPersonId: actor.id,
      before,
      after: { archivedAt: null },
      changeSource: "admin_console",
    });
  });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
}

// ---------------------------------------------------------------------------
// Email management
// ---------------------------------------------------------------------------

export async function addEmail(personId: string, formData: FormData) {
  await requireAdmin();
  const parsed = EmailInputSchema.parse(Object.fromEntries(formData));

  await prisma.$transaction(async (tx) => {
    // If new email should be primary, demote any existing primary first
    // (the partial unique index `WHERE is_primary = true` would reject otherwise).
    if (parsed.isPrimary) {
      await tx.emailAddress.updateMany({
        where: { personId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    try {
      await tx.emailAddress.create({
        data: {
          personId,
          address: parsed.address,
          kind: parsed.kind,
          isPrimary: parsed.isPrimary,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new Error(`Email "${parsed.address}" is already in use.`);
      }
      throw err;
    }
  });

  revalidatePath(`/admin/people/${personId}`);
}

export async function setPrimaryEmail(personId: string, emailId: string) {
  await requireAdmin();

  await prisma.$transaction([
    prisma.emailAddress.updateMany({
      where: { personId, isPrimary: true, NOT: { id: emailId } },
      data: { isPrimary: false },
    }),
    prisma.emailAddress.update({
      where: { id: emailId },
      data: { isPrimary: true, archivedAt: null },
    }),
  ]);

  revalidatePath(`/admin/people/${personId}`);
}

export async function archiveEmail(personId: string, emailId: string) {
  await requireAdmin();

  await prisma.emailAddress.update({
    where: { id: emailId },
    data: { archivedAt: new Date(), isPrimary: false },
  });

  revalidatePath(`/admin/people/${personId}`);
}

export async function restoreEmail(personId: string, emailId: string) {
  await requireAdmin();

  await prisma.emailAddress.update({
    where: { id: emailId },
    data: { archivedAt: null },
  });

  revalidatePath(`/admin/people/${personId}`);
}

// ---------------------------------------------------------------------------
// Student details
// ---------------------------------------------------------------------------

/**
 * Update the Student row attached to this person. Throws if the person is not
 * a student yet — use `addStudentRole` to create one first (added in a later
 * slice). Skill level is updated separately via `setSkillLevel`.
 */
export async function updateStudent(personId: string, formData: FormData) {
  await requireAdmin();
  assertNotSystem(personId);

  const parsed = StudentInputSchema.parse(Object.fromEntries(formData));

  await prisma.student.update({
    where: { personId },
    data: {
      enrollmentStatus: parsed.enrollmentStatus,
      school: parsed.school ?? null,
      medicalNotes: parsed.medicalNotes ?? null,
    },
  });

  revalidatePath(`/admin/people/${personId}`);
}

/**
 * Update only the skill level on the Student row. Used by the inline
 * dropdown in the Person hero card so it can save with one round-trip.
 *
 * Pass `level: ""` (or `null`) to clear the level.
 */
export async function setSkillLevel(personId: string, level: string | null) {
  const { person: adminPerson } = await requireAdmin();
  assertNotSystem(personId);

  const { skillLevel } = SkillLevelInputSchema.parse({
    skillLevel: level ?? "",
  });

  const before = await prisma.student.findUnique({
    where: { personId },
    select: { skillLevel: true },
  });
  if (!before) {
    throw new Error("This person is not a student.");
  }

  await prisma.$transaction([
    prisma.student.update({
      where: { personId },
      data: { skillLevel },
    }),
    prisma.studentSkillHistory.create({
      data: {
        studentId: personId,
        fromLevel: before.skillLevel,
        toLevel: skillLevel,
        changedByPersonId: adminPerson.id,
        reason: "admin_edit",
      },
    }),
  ]);

  revalidatePath(`/admin/people/${personId}`);
}
