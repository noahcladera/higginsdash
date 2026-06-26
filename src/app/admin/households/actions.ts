"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_HOUSEHOLD_ID } from "@/lib/system-ids";
import { recordAudit } from "@/lib/audit";
import { savedRedirectPath } from "@/lib/feedback/saved-flash";
import type { SimpleActionResult } from "@/lib/feedback/types";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const blank = z
  .string()
  .transform((v) => (v.trim() === "" ? undefined : v.trim()))
  .optional();

const HouseholdInputSchema = z.object({
  displayName: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Household name is required").max(200)),
  primaryContactPersonId: z.string().uuid("Pick a primary contact"),
  addressLine1: blank.pipe(z.string().max(200).optional()),
  addressLine2: blank.pipe(z.string().max(200).optional()),
  postalCode: blank.pipe(z.string().max(20).optional()),
  city: blank.pipe(z.string().max(100).optional()),
  country: z
    .string()
    .transform((v) => v.trim().toUpperCase() || "NL")
    .pipe(z.string().length(2, "Use 2-letter country code")),
  notes: blank.pipe(z.string().max(2000).optional()),
});

const AddMemberSchema = z.object({
  personId: z.string().uuid("Pick a person"),
  roleInHousehold: z.enum(["adult", "child"]),
});

function assertNotSystem(id: string) {
  if (id === SYSTEM_HOUSEHOLD_ID) {
    throw new Error("Cannot modify the system placeholder household.");
  }
}

// ---------------------------------------------------------------------------
// Household CRUD
// ---------------------------------------------------------------------------

export async function createHousehold(formData: FormData) {
  await requireAdmin();
  const parsed = HouseholdInputSchema.parse(Object.fromEntries(formData));

  // Refuse if the chosen primary contact already belongs to a different
  // household (one-household-strict). They'd hit the unique constraint anyway,
  // but a clear message is much friendlier than a Prisma error.
  const existingMembership = await prisma.householdMember.findUnique({
    where: { personId: parsed.primaryContactPersonId },
    select: { householdId: true },
  });
  if (existingMembership) {
    throw new Error(
      "That person already belongs to a household. Pick someone unattached, or move them first.",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const hh = await tx.household.create({
      data: {
        displayName: parsed.displayName,
        primaryContactPersonId: parsed.primaryContactPersonId,
        addressLine1: parsed.addressLine1 ?? null,
        addressLine2: parsed.addressLine2 ?? null,
        postalCode: parsed.postalCode ?? null,
        city: parsed.city ?? null,
        country: parsed.country,
        notes: parsed.notes ?? null,
      },
      select: { id: true },
    });

    await tx.householdMember.create({
      data: {
        householdId: hh.id,
        personId: parsed.primaryContactPersonId,
        roleInHousehold: "adult",
      },
    });

    return hh;
  });

  revalidatePath("/admin/households");
  revalidatePath("/admin/people");
  redirect(savedRedirectPath(`/admin/households/${created.id}`));
}

export async function updateHousehold(
  id: string,
  formData: FormData,
): Promise<SimpleActionResult> {
  await requireAdmin();
  assertNotSystem(id);

  let parsed;
  try {
    parsed = HouseholdInputSchema.parse(Object.fromEntries(formData));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    }
    return { ok: false, error: "Invalid input" };
  }

  try {
    await prisma.household.update({
      where: { id },
      data: {
        displayName: parsed.displayName,
        primaryContactPersonId: parsed.primaryContactPersonId,
        addressLine1: parsed.addressLine1 ?? null,
        addressLine2: parsed.addressLine2 ?? null,
        postalCode: parsed.postalCode ?? null,
        city: parsed.city ?? null,
        country: parsed.country,
        notes: parsed.notes ?? null,
      },
    });
  } catch {
    return { ok: false, error: "Could not save household — try again." };
  }

  revalidatePath("/admin/households");
  revalidatePath(`/admin/households/${id}`);
  return { ok: true, message: "Household saved" };
}

export async function archiveHousehold(id: string) {
  const { person: actor } = await requireAdmin();
  assertNotSystem(id);

  const before = await prisma.household.findUniqueOrThrow({
    where: { id },
    select: { id: true, displayName: true, archivedAt: true },
  });
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.household.update({
      where: { id },
      data: { archivedAt: now },
    });
    await recordAudit({
      tx,
      tableName: "households",
      rowId: id,
      action: "update",
      changedByPersonId: actor.id,
      before,
      after: { archivedAt: now.toISOString() },
      changeSource: "admin_console",
    });
  });

  revalidatePath("/admin/households");
  revalidatePath(`/admin/households/${id}`);
}

export async function restoreHousehold(id: string) {
  const { person: actor } = await requireAdmin();
  assertNotSystem(id);

  const before = await prisma.household.findUniqueOrThrow({
    where: { id },
    select: { id: true, displayName: true, archivedAt: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.household.update({
      where: { id },
      data: { archivedAt: null },
    });
    await recordAudit({
      tx,
      tableName: "households",
      rowId: id,
      action: "update",
      changedByPersonId: actor.id,
      before,
      after: { archivedAt: null },
      changeSource: "admin_console",
    });
  });

  revalidatePath("/admin/households");
  revalidatePath(`/admin/households/${id}`);
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addMember(householdId: string, formData: FormData) {
  await requireAdmin();
  const parsed = AddMemberSchema.parse(Object.fromEntries(formData));

  try {
    await prisma.householdMember.create({
      data: {
        householdId,
        personId: parsed.personId,
        roleInHousehold: parsed.roleInHousehold,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error(
        "That person already belongs to a household (one household per person — R-A).",
      );
    }
    throw err;
  }

  revalidatePath(`/admin/households/${householdId}`);
  revalidatePath("/admin/people");
}

export async function removeMember(
  householdId: string,
  householdMemberId: string,
) {
  await requireAdmin();

  // Don't allow removing the primary contact (would leave a dangling FK).
  const hh = await prisma.household.findUnique({
    where: { id: householdId },
    select: { primaryContactPersonId: true },
  });
  const member = await prisma.householdMember.findUnique({
    where: { id: householdMemberId },
    select: { personId: true },
  });
  if (!hh || !member) throw new Error("Not found.");
  if (member.personId === hh.primaryContactPersonId) {
    throw new Error(
      "Pick a different primary contact before removing this member.",
    );
  }

  await prisma.householdMember.delete({ where: { id: householdMemberId } });

  revalidatePath(`/admin/households/${householdId}`);
  revalidatePath("/admin/people");
}

export async function setPrimaryContact(
  householdId: string,
  personId: string,
) {
  await requireAdmin();

  // Person must already be a member of this household.
  const member = await prisma.householdMember.findUnique({
    where: { personId },
    select: { householdId: true },
  });
  if (!member || member.householdId !== householdId) {
    throw new Error("Primary contact must already be a member of this household.");
  }

  await prisma.household.update({
    where: { id: householdId },
    data: { primaryContactPersonId: personId },
  });

  revalidatePath(`/admin/households/${householdId}`);
}
