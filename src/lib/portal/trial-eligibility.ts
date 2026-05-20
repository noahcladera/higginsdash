import { cache } from "react";
import { prisma } from "@/lib/prisma";

const LIVE_ENROLLMENT_STATUSES = ["active", "pending_payment", "waitlist"] as const;

interface TrialEligibilityArgs {
  personId: string;
  householdId: string | null;
}

/**
 * Returns true when anyone in the viewer's household currently has a live
 * enrollment. Falls back to the viewer-only check when they have no household.
 */
export async function householdHasLiveEnrollment(
  args: TrialEligibilityArgs,
): Promise<boolean> {
  return _householdHasLiveEnrollmentCached(args.personId, args.householdId);
}

const _householdHasLiveEnrollmentCached = cache(_householdHasLiveEnrollment);

async function _householdHasLiveEnrollment(
  personId: string,
  householdId: string | null,
): Promise<boolean> {
  const personIds = householdId
    ? (
        await prisma.householdMember.findMany({
          where: { householdId },
          select: { personId: true },
        })
      ).map((m) => m.personId)
    : [personId];

  if (personIds.length === 0) return false;

  const count = await prisma.enrollment.count({
    where: {
      studentPersonId: { in: personIds },
      status: { in: [...LIVE_ENROLLMENT_STATUSES] },
    },
  });
  return count > 0;
}
