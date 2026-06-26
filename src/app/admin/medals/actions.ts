"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCoachAssignmentGaps } from "@/lib/medals/coach-medals-report";
import {
  buildLevelReminderInboxBody,
  buildMedalReminderInboxBody,
} from "@/lib/medals/reminder-messages";
import { notify } from "@/lib/notifications/notify";
import { resolveAppOrigin } from "@/lib/site-url";
import { getCurrentBrand } from "@/lib/tenant";

export type SendCoachAssignmentReminderResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendCoachAssignmentReminder(input: {
  coachPersonId: string;
  kind: "medals" | "levels";
}): Promise<SendCoachAssignmentReminderResult> {
  await requireAdmin();

  const coachPersonId = input.coachPersonId.trim();
  if (!coachPersonId) {
    return { ok: false, error: "Coach is required." };
  }

  const [gaps, brand, origin] = await Promise.all([
    getCoachAssignmentGaps(coachPersonId),
    getCurrentBrand(),
    resolveAppOrigin(),
  ]);

  const list =
    input.kind === "medals" ? gaps.missingMedals : gaps.missingLevels;

  if (list.length === 0) {
    return {
      ok: false,
      error:
        input.kind === "medals"
          ? "No students missing medals for this coach."
          : "No students missing skill levels for this coach.",
    };
  }

  const body =
    input.kind === "medals"
      ? buildMedalReminderInboxBody({
          coachName: gaps.coachName,
          brandName: brand.shortName,
          origin,
          gaps: list,
        })
      : buildLevelReminderInboxBody({
          coachName: gaps.coachName,
          brandName: brand.shortName,
          origin,
          gaps: list,
        });

  const templateKey =
    input.kind === "medals"
      ? "coach.levels.reminder.medals"
      : "coach.levels.reminder.skills";

  const subject =
    input.kind === "medals"
      ? "Reminder: assign student medals"
      : "Reminder: assign student skill levels";

  const firstSeriesId = list[0]?.seriesId ?? null;

  await notify({
    recipientPersonId: coachPersonId,
    templateKey,
    subject,
    body,
    relatedTable: firstSeriesId ? "class_series" : undefined,
    relatedRowId: firstSeriesId ?? undefined,
  });

  revalidatePath("/coach/inbox");
  revalidatePath("/admin/medals");

  return { ok: true };
}
