"use server";

/**
 * Admin: grant household credit (manual office adjustment).
 *
 * Wraps `grantHouseholdCredit` with the admin auth gate and a path
 * revalidation so the household detail page reflects the change
 * without a hard reload. Negative spends never come from this file —
 * those are written by the lesson checkout via
 * `spendHouseholdCredit` (in the same transaction as the Payment).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  grantHouseholdCredit,
  type IssuableCreditReason,
} from "@/lib/credits";
import { notify, primaryEmailOf } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const GrantInput = z.object({
  householdId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  reason: z.enum([
    "transfer_remainder",
    "withdrawal_refund",
    "admin_adjustment",
  ]),
  note: z.string().trim().max(500).optional().nullable(),
});

export type GrantActionResult =
  | { ok: true; creditId: string }
  | { ok: false; error: string };

export async function grantHouseholdCreditAction(
  input: z.input<typeof GrantInput>,
): Promise<GrantActionResult> {
  const parsed = GrantInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter an amount in cents and a reason." };
  }
  const { person: admin } = await requireAdmin();

  const household = await prisma.household.findUnique({
    where: { id: parsed.data.householdId },
    select: {
      id: true,
      displayName: true,
      primaryContact: {
        select: {
          id: true,
          firstName: true,
          emails: {
            where: { isPrimary: true, archivedAt: null },
            select: { address: true, isPrimary: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!household) return { ok: false, error: "Household not found." };

  const result = await grantHouseholdCredit({
    householdId: household.id,
    amountCents: parsed.data.amountCents,
    reason: parsed.data.reason as IssuableCreditReason,
    createdByPersonId: admin.id,
    note: parsed.data.note ?? null,
  });

  // Tell the household primary contact in-app so they notice the
  // balance the next time they enroll.
  if (household.primaryContact) {
    const email = primaryEmailOf(household.primaryContact);
    await notify({
      recipientPersonId: household.primaryContact.id,
      recipientEmail: email,
      channels: email ? ["in_app", "email"] : ["in_app"],
      templateKey: "credits.granted",
      subject: `€${(parsed.data.amountCents / 100).toFixed(2)} added to your lesson credit`,
      body:
        `We've added €${(parsed.data.amountCents / 100).toFixed(2)} of lesson credit to ${household.displayName}.\n\n` +
        (parsed.data.note ? `Note: ${parsed.data.note}\n\n` : "") +
        "It will be applied automatically next time you enroll in a class.",
      relatedTable: "household_credits",
      relatedRowId: result.creditId,
    });
  }

  revalidatePath(`/admin/households/${household.id}`);
  revalidatePath("/portal/credits");
  revalidatePath("/portal");
  return { ok: true, creditId: result.creditId };
}
