"use server";

/**
 * Server actions for coach declared availability (recurring weekly windows).
 *
 *   - setCoachAvailability(windows) → full-replace the caller coach's
 *     availability rows.
 *
 * Modeled on `setAvailability` in src/lib/ladder/actions.ts: a transaction
 * does `deleteMany` + `createMany` so the row set always matches what the
 * coach last submitted (no orphaned windows from a stale UI). The audit
 * row uses a synthetic id derived from the personId since this is a
 * collection-level overwrite, not a single-row mutation.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/auth/require-coach";
import { recordAudit } from "@/lib/audit";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const AvailabilitySchema = z.object({
  windows: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(24 * 60 - 1),
        endMinute: z.number().int().min(1).max(24 * 60),
      }),
    )
    .max(20),
});

export type SetCoachAvailabilityInput = z.input<typeof AvailabilitySchema>;

export async function setCoachAvailability(
  raw: SetCoachAvailabilityInput,
): Promise<ActionResult> {
  let actorPersonId: string;
  try {
    const { person } = await requireCoach();
    actorPersonId = person.id;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = AvailabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid availability.",
    };
  }
  for (const w of parsed.data.windows) {
    if (w.endMinute <= w.startMinute) {
      return { ok: false, error: "Each window's end must be after its start." };
    }
  }

  const before = await prisma.coachAvailability.findMany({
    where: { personId: actorPersonId },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });

  await prisma.$transaction(async (tx) => {
    await tx.coachAvailability.deleteMany({
      where: { personId: actorPersonId },
    });
    if (parsed.data.windows.length > 0) {
      await tx.coachAvailability.createMany({
        data: parsed.data.windows.map((w) => ({
          personId: actorPersonId,
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      });
    }
    const after = await tx.coachAvailability.findMany({
      where: { personId: actorPersonId },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
    });
    await recordAudit({
      tx,
      tableName: "coach_availability",
      rowId: actorPersonId,
      action: "update",
      changedByPersonId: actorPersonId,
      before,
      after,
    });
  });

  revalidatePath("/coach/availability");
  revalidatePath("/admin/coaches");
  return { ok: true };
}
