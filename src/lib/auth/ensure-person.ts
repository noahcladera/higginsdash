import { prisma } from "@/lib/prisma";
import { SYSTEM_PERSON_IDS } from "@/lib/system-ids";

/**
 * Idempotent. Called from the auth callback after every magic-link sign-in.
 *
 * - If no `people` row exists for this auth user id, create one.
 *   - The very first ever REAL person (i.e. someone who logged in via
 *     Supabase Auth, ignoring the synthetic `System` seed placeholder)
 *     becomes admin so Noah/Heather get into the system on first sign-in
 *     without manually flipping a flag in SQL.
 * - If the person exists, just bump `last_login_at`.
 * - Always make sure the auth email is captured in `email_addresses`
 *   (and marked primary if it's the first email for this person).
 *
 * Names default to "" — the admin can fill them in once they're in.
 */
export async function ensurePersonForAuthUser(args: {
  authUserId: string;
  email: string | null;
}) {
  const { authUserId, email } = args;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.person.findUnique({ where: { id: authUserId } });

    if (!existing) {
      // Count REAL people only — the System seed placeholder doesn't count
      // (it isn't a logged-in user, so it shouldn't block the very first real
      // user from becoming admin).
      const realPeopleCount = await tx.person.count({
        where: { id: { notIn: [...SYSTEM_PERSON_IDS] } },
      });
      const isFirstUser = realPeopleCount === 0;

      await tx.person.create({
        data: {
          id: authUserId,
          firstName: "",
          lastName: "",
          isAdmin: isFirstUser,
          lastLoginAt: new Date(),
        },
      });

      // Auto-create a household-of-one for the new person so the foreign-key
      // shape is consistent (household stays optional in the schema, but having
      // one means future "switch to family" flows have something to attach to).
      // We skip this for v1 to keep the surface minimal — uncomment when the
      // member-portal slice needs it.
      // const household = await tx.household.create({...});
    } else {
      await tx.person.update({
        where: { id: authUserId },
        data: { lastLoginAt: new Date() },
      });
    }

    if (email) {
      const normalized = email.trim().toLowerCase();
      const existingEmail = await tx.emailAddress.findUnique({
        where: { address: normalized },
      });

      // address is globally unique — skip if another person already owns it
      if (!existingEmail || existingEmail.personId === authUserId) {
        if (!existingEmail) {
          const personEmailCount = await tx.emailAddress.count({
            where: { personId: authUserId },
          });

          await tx.emailAddress.create({
            data: {
              personId: authUserId,
              address: normalized,
              kind: "personal",
              isPrimary: personEmailCount === 0,
              isVerified: true,
              verifiedAt: new Date(),
            },
          });
        }
      }
    }
  });
}
