import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Mark a coach invite accepted once the invited person is signed in with
 * matching email and active coach/ZZP access.
 */
export async function markCoachInviteAccepted(args: {
  inviteId: string;
  personId: string;
}): Promise<boolean> {
  const updated = await prisma.coachInvite.updateMany({
    where: {
      id: args.inviteId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: {
      acceptedAt: new Date(),
      acceptedById: args.personId,
    },
  });

  if (updated.count > 0) {
    revalidatePath("/admin/coaches");
    revalidatePath("/coach");
  }

  return updated.count > 0;
}
