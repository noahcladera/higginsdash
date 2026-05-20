"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

const StatusSchema = z.enum([
  "new",
  "in_progress",
  "scheduled",
  "converted",
  "closed",
]);

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema,
  adminNotes: z
    .string()
    .max(4000)
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v : null)),
});

export type UpdateTrialInterestInput = z.input<typeof UpdateSchema>;

/**
 * Admin worklist: move a lead through new → in_progress → scheduled →
 * converted/closed and capture an internal note. Stamps `contactedAt`
 * when the status leaves `new`, and `closedAt` once it lands in a
 * terminal state, so the queue can hide closed rows by default.
 */
export async function updateTrialInterest(formData: FormData) {
  await requireAdmin();
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid trial-interest update.",
    );
  }
  const { id, status, adminNotes } = parsed.data;

  const current = await prisma.trialInterest.findUnique({
    where: { id },
    select: { status: true, contactedAt: true, closedAt: true },
  });
  if (!current) throw new Error("Trial request not found.");

  const now = new Date();
  const contactedAt =
    current.contactedAt ??
    (status === "new" ? null : now);
  const closedAt =
    status === "converted" || status === "closed"
      ? (current.closedAt ?? now)
      : null;

  await prisma.trialInterest.update({
    where: { id },
    data: {
      status,
      adminNotes,
      contactedAt,
      closedAt,
    },
  });

  revalidatePath("/admin/trial-interest");
  revalidatePath("/admin");
}
