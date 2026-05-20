/**
 * Returning vs new member detection.
 *
 * Triaz's published pricing rules say returning members never get
 * proration — they always pay the full annual fee no matter what time
 * of year they re-join. We treat a household as "returning" if there's
 * any prior `Membership` row for it (any status), so a household that
 * lapsed and is buying again pays the full sticker. Brand-new
 * households (no prior memberships) get the prorated quarter / month
 * price.
 *
 * Detection is server-only so the buy form can't lie about it. Both
 * the buy menu (display) and the `createMembership` server action
 * (charge) call this same helper to avoid drift between what the
 * customer sees and what they pay.
 */

import { prisma } from "@/lib/prisma";

export async function isReturningHousehold(householdId: string | null): Promise<boolean> {
  if (!householdId) return false;
  const prior = await prisma.membership.count({ where: { householdId } });
  return prior > 0;
}
