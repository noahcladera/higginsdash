"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CoachEmploymentType, CoachInviteRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { recordAudit } from "@/lib/audit/record";
import { resolveAppOrigin } from "@/lib/site-url";

const CreateCoachInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.nativeEnum(CoachInviteRole),
  clubIds: z.array(z.string().uuid()),
});

export type CoachInviteActionResult =
  | { ok: true }
  | { ok: false; error: string };

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false as const, error: "Server missing Supabase credentials." };
  }
  return {
    ok: true as const,
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createCoachInviteForm(
  _prev: CoachInviteActionResult | undefined,
  formData: FormData,
): Promise<CoachInviteActionResult> {
  const email = formData.get("email");
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");
  const roleRaw = formData.get("role");
  const clubIds = formData
    .getAll("clubIds")
    .filter((v): v is string => typeof v === "string");
  const role =
    roleRaw === CoachInviteRole.staff_coach || roleRaw === CoachInviteRole.zzp_coach
      ? roleRaw
      : null;

  if (!role) {
    return { ok: false, error: "Choose staff or ZZP coach." };
  }

  return createCoachInvite({
    email: String(email ?? ""),
    firstName: String(firstName ?? ""),
    lastName: String(lastName ?? ""),
    role,
    clubIds,
  });
}

export async function createCoachInvite(
  raw: z.infer<typeof CreateCoachInviteSchema>,
): Promise<CoachInviteActionResult> {
  const parsed = CreateCoachInviteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (data.role === CoachInviteRole.zzp_coach && data.clubIds.length === 0) {
    return {
      ok: false,
      error: "Choose at least one club for a ZZP coach.",
    };
  }

  const adminCtx = await requireAdmin();
  const svc = getSupabaseAdmin();
  if (!svc.ok) return { ok: false, error: svc.error };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await prisma.coachInvite.create({
    data: {
      token,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      allowedClubIds: data.clubIds,
      invitedById: adminCtx.person.id,
      expiresAt,
    },
  });

  const origin = await resolveAppOrigin();
  const nextPath = `/coach/accept-invite?token=${encodeURIComponent(token)}`;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { error } = await svc.client.auth.admin.inviteUserByEmail(
    data.email,
    {
      redirectTo,
      data: {
        first_name: data.firstName,
        last_name: data.lastName,
      },
    },
  );

  if (error) {
    await prisma.coachInvite.deleteMany({ where: { token } });
    const msg = error.message ?? "Could not send invite email.";
    if (/already been registered/i.test(msg)) {
      return {
        ok: false,
        error:
          "That email already has an account. Ask them to sign in, or remove the auth user in Supabase and try again.",
      };
    }
    return { ok: false, error: msg };
  }

  revalidatePath("/admin/coaches");
  redirect("/admin/coaches");
}

export async function revokeCoachInviteForm(formData: FormData): Promise<void> {
  const idRaw = formData.get("inviteId");
  const inviteId = typeof idRaw === "string" ? idRaw.trim() : "";
  await revokeCoachInvite(inviteId);
}

export async function resendCoachInviteForm(formData: FormData): Promise<void> {
  const idRaw = formData.get("inviteId");
  const inviteId = typeof idRaw === "string" ? idRaw.trim() : "";
  await resendCoachInvite(inviteId);
}

export async function revokeCoachInvite(
  inviteId: string,
): Promise<CoachInviteActionResult> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(inviteId);
  if (!id.success) return { ok: false, error: "Invalid invite." };

  await prisma.coachInvite.updateMany({
    where: {
      id: inviteId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/admin/coaches");
  return { ok: true };
}

export async function resendCoachInvite(
  inviteId: string,
): Promise<CoachInviteActionResult> {
  await requireAdmin();

  const svc = getSupabaseAdmin();
  if (!svc.ok) return { ok: false, error: svc.error };

  const invite = await prisma.coachInvite.findUnique({
    where: { id: inviteId },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt) {
    return { ok: false, error: "Invite not found or no longer active." };
  }
  if (invite.expiresAt < new Date()) {
    return { ok: false, error: "Invite expired. Create a new one." };
  }

  const origin = await resolveAppOrigin();
  const nextPath = `/coach/accept-invite?token=${encodeURIComponent(invite.token)}`;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const { error } = await svc.client.auth.admin.inviteUserByEmail(
    invite.email,
    { redirectTo },
  );

  if (error) {
    return { ok: false, error: error.message ?? "Could not resend invite." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Inline commercial-detail editing for the staff/ZZP coach lists.
//
// These actions live alongside the invite ones so admins have one
// surface for everything coach-account related. The hourly + court-rental
// fields stay the source of truth for invoicing — they're already
// mutated from `setCoachCourtRentalRate` (private-lessons surface) but
// that page is buried behind a coach selector; the coaches list is the
// natural place to keep them up to date day-to-day.
// ---------------------------------------------------------------------------

const NullableMoneySchema = z
  .union([
    z.number().min(0).max(999),
    z.string().trim(),
    z.null(),
  ])
  .transform((v) => {
    if (v === null) return null;
    if (typeof v === "string") {
      if (v.length === 0) return null;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n)) {
        throw new Error("Invalid number");
      }
      return n;
    }
    return v;
  })
  .pipe(z.number().min(0).max(999).nullable());

const UpdateCoachCommercialsSchema = z.object({
  coachPersonId: z.string().uuid(),
  defaultHourlyRate: NullableMoneySchema,
  courtRentalRate: NullableMoneySchema,
  knltbQualification: z.string().trim().max(120).nullable(),
  employmentType: z.nativeEnum(CoachEmploymentType),
  isActive: z.boolean(),
});

export type UpdateCoachCommercialsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Update the commercial fields on a staff `Coach` row from the admin
 * coaches list. Wraps an audit-logged transactional update so an
 * accidental rate change is always traceable.
 */
export async function updateCoachCommercials(
  raw: z.input<typeof UpdateCoachCommercialsSchema>,
): Promise<UpdateCoachCommercialsResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = UpdateCoachCommercialsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  const before = await prisma.coach.findUnique({
    where: { personId: data.coachPersonId },
    select: {
      personId: true,
      defaultHourlyRate: true,
      courtRentalRate: true,
      knltbQualification: true,
      employmentType: true,
      isActive: true,
    },
  });
  if (!before) return { ok: false, error: "Staff coach not found." };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.coach.update({
        where: { personId: data.coachPersonId },
        data: {
          defaultHourlyRate:
            data.defaultHourlyRate == null
              ? null
              : new Prisma.Decimal(data.defaultHourlyRate.toFixed(2)),
          courtRentalRate:
            data.courtRentalRate == null
              ? null
              : new Prisma.Decimal(data.courtRentalRate.toFixed(2)),
          knltbQualification: data.knltbQualification ?? null,
          employmentType: data.employmentType,
          isActive: data.isActive,
        },
      });

      await recordAudit({
        tableName: "coaches",
        rowId: data.coachPersonId,
        action: "update",
        changedByPersonId: admin.person.id,
        before,
        after: updated,
        changeSource: "admin_console",
        tx,
      });
    });
  } catch (e) {
    return { ok: false, error: `Could not save: ${(e as Error).message}` };
  }

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/private-lessons");
  return { ok: true };
}

const UpdateZzpCoachCommercialsSchema = z.object({
  zzpPersonId: z.string().uuid(),
  defaultCourtRentalRate: NullableMoneySchema,
  isActive: z.boolean(),
});

export type UpdateZzpCoachCommercialsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * ZZP-side equivalent of {@link updateCoachCommercials}. Kept as its
 * own action so the schema, audit row, and revalidation path stay
 * tight to the `zzp_coaches` table.
 */
export async function updateZzpCoachCommercials(
  raw: z.input<typeof UpdateZzpCoachCommercialsSchema>,
): Promise<UpdateZzpCoachCommercialsResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = UpdateZzpCoachCommercialsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  const before = await prisma.zzpCoach.findUnique({
    where: { personId: data.zzpPersonId },
    select: {
      personId: true,
      defaultCourtRentalRate: true,
      isActive: true,
    },
  });
  if (!before) return { ok: false, error: "ZZP coach not found." };

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.zzpCoach.update({
        where: { personId: data.zzpPersonId },
        data: {
          defaultCourtRentalRate:
            data.defaultCourtRentalRate == null
              ? null
              : new Prisma.Decimal(data.defaultCourtRentalRate.toFixed(2)),
          isActive: data.isActive,
        },
      });

      await recordAudit({
        tableName: "zzp_coaches",
        rowId: data.zzpPersonId,
        action: "update",
        changedByPersonId: admin.person.id,
        before,
        after: updated,
        changeSource: "admin_console",
        tx,
      });
    });
  } catch (e) {
    return { ok: false, error: `Could not save: ${(e as Error).message}` };
  }

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/private-lessons");
  return { ok: true };
}
