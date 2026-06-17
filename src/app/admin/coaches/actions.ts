"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CoachEmploymentType, CoachInviteRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { recordAudit } from "@/lib/audit/record";
import { resolveAppOrigin } from "@/lib/site-url";
import { provisionCoachFromInvite } from "@/lib/auth/provision-coach";
import { sendEmail } from "@/lib/email";
import { getCurrentBrand } from "@/lib/tenant";
import {
  findAuthUserByEmail,
} from "@/lib/supabase/admin";

const CreateCoachInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.nativeEnum(CoachInviteRole),
  clubIds: z.array(z.string().uuid()),
  loginMethod: z.enum(["magiclink", "password"]).default("magiclink"),
});

export type CoachInviteActionResult =
  | {
      ok: true;
      loginMethod: "magiclink";
      email: string;
      actionLink: string;
      emailed: boolean;
    }
  | {
      ok: true;
      loginMethod: "password";
      email: string;
      temporaryPassword: string;
      loginUrl: string;
      emailed: boolean;
    }
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

function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

function mapProvisionError(code: string): string {
  switch (code) {
    case "HAS_ZZP":
      return "This email already has an independent coach profile. Contact the office.";
    case "HAS_STAFF_COACH":
      return "This email already has a staff coach profile. Contact the office.";
    case "EMAIL_OWNED_BY_OTHER":
      return "That email is linked to another person in the system.";
    default:
      return "Could not provision coach account.";
  }
}

async function ensureAuthUser(
  client: SupabaseClient,
  email: string,
  loginMethod: "magiclink" | "password",
  temporaryPassword?: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  let authUser = await findAuthUserByEmail(client, email);

  if (!authUser) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(loginMethod === "password" && temporaryPassword
        ? { password: temporaryPassword }
        : {}),
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message ?? "Could not create auth user.",
      };
    }
    return { ok: true, userId: data.user.id };
  }

  if (loginMethod === "password" && temporaryPassword) {
    const { error } = await client.auth.admin.updateUserById(authUser.id, {
      password: temporaryPassword,
    });
    if (error) {
      return { ok: false, error: error.message ?? "Could not set password." };
    }
  }

  return { ok: true, userId: authUser.id };
}

async function generateMagicLink(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<{ ok: true; actionLink: string } | { ok: false; error: string }> {
  const { data, error } = await client.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    return {
      ok: false,
      error: error?.message ?? "Could not generate login link.",
    };
  }
  return { ok: true, actionLink };
}

async function sendCoachLoginEmail(args: {
  email: string;
  firstName: string;
  loginMethod: "magiclink" | "password";
  actionLink?: string;
  loginUrl?: string;
  temporaryPassword?: string;
}): Promise<boolean> {
  const brand = await getCurrentBrand();
  const greeting = args.firstName.trim() || "Coach";

  try {
    if (args.loginMethod === "magiclink" && args.actionLink) {
      await sendEmail({
        to: args.email,
        subject: `${brand.shortName} coach portal — sign in`,
        body: [
          `Hi ${greeting},`,
          "",
          `You've been invited to the ${brand.shortName} coach portal.`,
          "",
          "Sign in with this one-time link:",
          args.actionLink,
          "",
          "If the link expires, ask an admin to generate a new one from Coaches → Pending invites.",
          "",
          `— ${brand.shortName}`,
        ].join("\n"),
      });
    } else if (
      args.loginMethod === "password" &&
      args.loginUrl &&
      args.temporaryPassword
    ) {
      await sendEmail({
        to: args.email,
        subject: `${brand.shortName} coach portal — your login`,
        body: [
          `Hi ${greeting},`,
          "",
          `You've been invited to the ${brand.shortName} coach portal.`,
          "",
          `Sign in at: ${args.loginUrl}`,
          `Email: ${args.email}`,
          `Temporary password: ${args.temporaryPassword}`,
          "",
          "Change your password after the first sign-in if you can.",
          "",
          `— ${brand.shortName}`,
        ].join("\n"),
      });
    }
    return true;
  } catch (err) {
    console.error("[coach-invite] email delivery failed", err);
    return false;
  }
}

export async function createCoachInviteForm(
  _prev: CoachInviteActionResult | undefined,
  formData: FormData,
): Promise<CoachInviteActionResult> {
  const email = formData.get("email");
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");
  const roleRaw = formData.get("role");
  const loginMethodRaw = formData.get("loginMethod");
  const clubIds = formData
    .getAll("clubIds")
    .filter((v): v is string => typeof v === "string");
  const role =
    roleRaw === CoachInviteRole.staff_coach || roleRaw === CoachInviteRole.zzp_coach
      ? roleRaw
      : null;
  const loginMethod =
    loginMethodRaw === "password" ? "password" : "magiclink";

  if (!role) {
    return { ok: false, error: "Choose staff or ZZP coach." };
  }

  return createCoachInvite({
    email: String(email ?? ""),
    firstName: String(firstName ?? ""),
    lastName: String(lastName ?? ""),
    role,
    clubIds,
    loginMethod,
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

  await requireAdmin();
  const svc = getSupabaseAdmin();
  if (!svc.ok) return { ok: false, error: svc.error };

  const temporaryPassword =
    data.loginMethod === "password" ? generateTemporaryPassword() : undefined;

  const authResult = await ensureAuthUser(
    svc.client,
    data.email,
    data.loginMethod,
    temporaryPassword,
  );
  if (!authResult.ok) return authResult;

  try {
    await prisma.$transaction(async (tx) => {
      await provisionCoachFromInvite(tx, {
        authUserId: authResult.userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        allowedClubIds: data.clubIds,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PROVISION_FAILED";
    return { ok: false, error: mapProvisionError(msg) };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const adminCtx = await requireAdmin();

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
  const redirectTo = `${origin}/auth/callback`;

  if (data.loginMethod === "password" && temporaryPassword) {
    const loginUrl = `${origin}/login`;
    const emailed = await sendCoachLoginEmail({
      email: data.email,
      firstName: data.firstName,
      loginMethod: "password",
      loginUrl,
      temporaryPassword,
    });
    revalidatePath("/admin/coaches");
    return {
      ok: true,
      loginMethod: "password",
      email: data.email,
      temporaryPassword,
      loginUrl,
      emailed,
    };
  }

  const linkResult = await generateMagicLink(svc.client, data.email, redirectTo);
  if (!linkResult.ok) {
    await prisma.coachInvite.deleteMany({ where: { token } });
    return linkResult;
  }

  const emailed = await sendCoachLoginEmail({
    email: data.email,
    firstName: data.firstName,
    loginMethod: "magiclink",
    actionLink: linkResult.actionLink,
  });

  revalidatePath("/admin/coaches");
  return {
    ok: true,
    loginMethod: "magiclink",
    email: data.email,
    actionLink: linkResult.actionLink,
    emailed,
  };
}

export async function revokeCoachInviteForm(formData: FormData): Promise<void> {
  const idRaw = formData.get("inviteId");
  const inviteId = typeof idRaw === "string" ? idRaw.trim() : "";
  await revokeCoachInvite(inviteId);
}

export async function resendCoachInviteForm(
  _prev: CoachInviteActionResult | undefined,
  formData: FormData,
): Promise<CoachInviteActionResult> {
  const idRaw = formData.get("inviteId");
  const inviteId = typeof idRaw === "string" ? idRaw.trim() : "";
  const loginMethodRaw = formData.get("loginMethod");
  const loginMethod =
    loginMethodRaw === "password" ? "password" : "magiclink";
  return resendCoachInvite(inviteId, loginMethod);
}

export async function revokeCoachInvite(inviteId: string): Promise<void> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(inviteId);
  if (!id.success) return;

  await prisma.coachInvite.updateMany({
    where: {
      id: inviteId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/admin/coaches");
}

export async function resendCoachInvite(
  inviteId: string,
  loginMethod: "magiclink" | "password" = "magiclink",
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

  const temporaryPassword =
    loginMethod === "password" ? generateTemporaryPassword() : undefined;

  const authResult = await ensureAuthUser(
    svc.client,
    invite.email,
    loginMethod,
    temporaryPassword,
  );
  if (!authResult.ok) return authResult;

  try {
    await prisma.$transaction(async (tx) => {
      await provisionCoachFromInvite(tx, {
        authUserId: authResult.userId,
        email: invite.email,
        firstName: invite.firstName ?? "",
        lastName: invite.lastName ?? "",
        role: invite.role,
        allowedClubIds: invite.allowedClubIds,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PROVISION_FAILED";
    return { ok: false, error: mapProvisionError(msg) };
  }

  const origin = await resolveAppOrigin();
  const redirectTo = `${origin}/auth/callback`;

  if (loginMethod === "password" && temporaryPassword) {
    const loginUrl = `${origin}/login`;
    const emailed = await sendCoachLoginEmail({
      email: invite.email,
      firstName: invite.firstName ?? "",
      loginMethod: "password",
      loginUrl,
      temporaryPassword,
    });
    revalidatePath("/admin/coaches");
    return {
      ok: true,
      loginMethod: "password",
      email: invite.email,
      temporaryPassword,
      loginUrl,
      emailed,
    };
  }

  const linkResult = await generateMagicLink(svc.client, invite.email, redirectTo);
  if (!linkResult.ok) return linkResult;

  const emailed = await sendCoachLoginEmail({
    email: invite.email,
    firstName: invite.firstName ?? "",
    loginMethod: "magiclink",
    actionLink: linkResult.actionLink,
  });

  revalidatePath("/admin/coaches");
  return {
    ok: true,
    loginMethod: "magiclink",
    email: invite.email,
    actionLink: linkResult.actionLink,
    emailed,
  };
}

// ---------------------------------------------------------------------------
// Inline commercial-detail editing for the staff/ZZP coach lists.
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
