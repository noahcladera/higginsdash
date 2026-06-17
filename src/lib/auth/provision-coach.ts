import {
  CoachEmploymentType,
  CoachInviteRole,
  type Prisma,
} from "@prisma/client";

function todayDateOnly(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Creates or updates CRM rows for a coach invite: Person, Coach/ZzpCoach,
 * and club scope. Safe to call when the person already exists (e.g. a
 * member who is also becoming a coach).
 */
export async function provisionCoachFromInvite(
  tx: Prisma.TransactionClient,
  args: {
    authUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: CoachInviteRole;
    allowedClubIds: string[];
  },
): Promise<void> {
  const email = args.email.trim().toLowerCase();
  const firstName = args.firstName.trim() || "Coach";
  const lastName = args.lastName.trim();

  const existing = await tx.person.findUnique({
    where: { id: args.authUserId },
    include: { coach: true, zzpCoach: true },
  });

  if (existing) {
    if (args.role === CoachInviteRole.staff_coach && existing.zzpCoach?.isActive) {
      throw new Error("HAS_ZZP");
    }
    if (args.role === CoachInviteRole.zzp_coach && existing.coach?.isActive) {
      throw new Error("HAS_STAFF_COACH");
    }
  }

  await tx.person.upsert({
    where: { id: args.authUserId },
    create: {
      id: args.authUserId,
      firstName,
      lastName,
      isAdmin: false,
      lastLoginAt: null,
    },
    update: {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    },
  });

  const personEmailCount = await tx.emailAddress.count({
    where: { personId: args.authUserId },
  });
  const emailRow = await tx.emailAddress.findUnique({
    where: { address: email },
    select: { personId: true },
  });
  if (!emailRow) {
    await tx.emailAddress.create({
      data: {
        personId: args.authUserId,
        address: email,
        kind: "personal",
        isPrimary: personEmailCount === 0,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
  } else if (emailRow.personId !== args.authUserId) {
    throw new Error("EMAIL_OWNED_BY_OTHER");
  }

  const person = await tx.person.findUniqueOrThrow({
    where: { id: args.authUserId },
    include: { coach: true, zzpCoach: true },
  });

  if (args.role === CoachInviteRole.staff_coach) {
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
  if (args.allowedClubIds.length > 0) {
    await tx.coachClubAccess.createMany({
      data: args.allowedClubIds.map((clubId) => ({
        personId: person.id,
        clubId,
      })),
    });
  }
}
