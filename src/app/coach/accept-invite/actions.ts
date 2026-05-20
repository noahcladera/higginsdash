"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CoachEmploymentType, CoachInviteRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function todayDateOnly(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Completes CRM onboarding after the coach followed the Supabase invite link
 * and has an active session. Creates Coach or ZzpCoach + club scope, marks invite accepted.
 */
export async function acceptCoachInvite(formData: FormData) {
  const tokenRaw = formData.get("token");
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (!token) {
    redirect("/coach/accept-invite?error=missing_token");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    const next = `/coach/accept-invite?token=${encodeURIComponent(token)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const email = user.email.trim().toLowerCase();

  const invite = await prisma.coachInvite.findUnique({
    where: { token },
  });

  if (!invite || invite.revokedAt) {
    redirect("/coach/accept-invite?error=invalid_invite");
  }
  if (invite.acceptedAt) {
    redirect("/coach");
  }
  if (invite.expiresAt < new Date()) {
    redirect("/coach/accept-invite?error=expired");
  }
  if (invite.email.trim().toLowerCase() !== email) {
    redirect("/coach/accept-invite?error=email_mismatch");
  }

  const existing = await prisma.person.findUnique({
    where: { id: user.id },
    include: { coach: true, zzpCoach: true },
  });
  if (!existing) {
    redirect("/coach/accept-invite?error=missing_person");
  }
  if (invite.role === CoachInviteRole.staff_coach && existing.zzpCoach) {
    redirect("/coach/accept-invite?error=has_zzp");
  }
  if (invite.role === CoachInviteRole.zzp_coach && existing.coach) {
    redirect("/coach/accept-invite?error=has_staff_coach");
  }

  await prisma.$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { id: user.id },
      include: { coach: true, zzpCoach: true },
    });
    if (!person) {
      throw new Error("MISSING_PERSON");
    }

    const firstName = invite.firstName?.trim() || person.firstName || "Coach";
    const lastName = invite.lastName?.trim() || person.lastName || "";

    await tx.person.update({
      where: { id: person.id },
      data: {
        firstName,
        lastName,
      },
    });

    if (invite.role === CoachInviteRole.staff_coach) {
      if (!person.coach) {
        await tx.coach.create({
          data: {
            personId: person.id,
            employmentType: CoachEmploymentType.employee,
            joinedOn: todayDateOnly(),
            isActive: true,
          },
        });
      } else if (!person.coach.isActive) {
        await tx.coach.update({
          where: { personId: person.id },
          data: { isActive: true, archivedAt: null },
        });
      }
    } else {
      if (!person.zzpCoach) {
        await tx.zzpCoach.create({
          data: {
            personId: person.id,
            isActive: true,
          },
        });
      } else if (!person.zzpCoach.isActive) {
        await tx.zzpCoach.update({
          where: { personId: person.id },
          data: { isActive: true, archivedAt: null },
        });
      }
    }

    await tx.coachClubAccess.deleteMany({
      where: { personId: person.id },
    });
    if (invite.allowedClubIds.length > 0) {
      await tx.coachClubAccess.createMany({
        data: invite.allowedClubIds.map((clubId) => ({
          personId: person.id,
          clubId,
        })),
      });
    }

    await tx.coachInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedById: person.id,
      },
    });
  });

  revalidatePath("/coach");
  redirect("/coach");
}
