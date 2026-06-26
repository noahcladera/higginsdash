"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markCoachInviteAccepted } from "@/lib/auth/complete-coach-invite";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Legacy accept-invite confirmation. Coach roles are now assigned at invite
 * time; this action only marks the invite accepted when a signed-in coach
 * confirms or follows an older link.
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

  const person = await prisma.person.findUnique({
    where: { id: user.id },
    include: { coach: true, zzpCoach: true },
  });
  if (!person) {
    redirect("/coach/accept-invite?error=missing_person");
  }

  const hasCoachAccess =
    person.coach?.isActive === true || person.zzpCoach?.isActive === true;

  if (!hasCoachAccess) {
    redirect("/coach/accept-invite?error=not_provisioned");
  }

  await markCoachInviteAccepted({
    inviteId: invite.id,
    personId: person.id,
  });

  revalidatePath("/coach");
  redirect("/coach");
}
