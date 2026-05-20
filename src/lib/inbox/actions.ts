"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolvePersonAccess } from "@/lib/auth/person-access";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const MarkReadSchema = z.object({
  notificationId: z.string().uuid(),
});

const MarkAllReadSchema = z.object({});

async function requireAnyone() {
  const access = await resolvePersonAccess();
  return access?.person ?? null;
}

export async function markNotificationRead(
  input: z.input<typeof MarkReadSchema>,
): Promise<ActionResult> {
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid id." };
  const person = await requireAnyone();
  if (!person) return { ok: false, error: "Not signed in." };

  await prisma.notification.updateMany({
    where: {
      id: parsed.data.notificationId,
      recipientPersonId: person.id,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/portal/inbox");
  revalidatePath("/coach/inbox");
  revalidatePath("/admin/inbox");
  return { ok: true };
}

export async function markAllNotificationsRead(
  _input?: z.input<typeof MarkAllReadSchema>,
): Promise<ActionResult> {
  const person = await requireAnyone();
  if (!person) return { ok: false, error: "Not signed in." };

  await prisma.notification.updateMany({
    where: {
      recipientPersonId: person.id,
      channel: "in_app",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/portal/inbox");
  revalidatePath("/coach/inbox");
  revalidatePath("/admin/inbox");
  return { ok: true };
}
