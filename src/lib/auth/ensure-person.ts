import { prisma } from "@/lib/prisma";
import { SYSTEM_PERSON_IDS } from "@/lib/system-ids";

export function parsePlatformAdminEmails(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdminEmails().has(email.trim().toLowerCase());
}

/**
 * Single source of truth for "should this newly-created person be an admin?".
 * Only the very first real user is ever auto-promoted, and only when either no
 * allowlist is configured (dev/bootstrap) OR their email is on the allowlist.
 * When an allowlist IS set, a non-allowlisted first signup is NOT made admin —
 * this closes the "first public registrant becomes admin" takeover path.
 */
export function shouldGrantFirstUserAdmin(args: {
  isFirstUser: boolean;
  email: string | null | undefined;
}): boolean {
  if (!args.isFirstUser) return false;
  const allowlist = parsePlatformAdminEmails();
  return allowlist.size === 0 || isPlatformAdminEmail(args.email);
}

/**
 * Idempotent. Called from the auth callback / accept-invite landing pages
 * after every magic-link or invite sign-in.
 *
 * - If no `people` row exists for this auth user id, create one.
 *   - The very first ever REAL person (ignoring the synthetic `System` seed)
 *     becomes admin so the first deploy operator gets in.
 * - If the person exists, just bump `last_login_at`.
 * - Make sure the auth email is captured in `email_addresses` (and marked
 *   primary if it's the first email for this person).
 *
 * Uses upserts to be safe against duplicate concurrent calls (middleware
 * claim refresh + page render landing within milliseconds).
 */
export async function ensurePersonForAuthUser(args: {
  authUserId: string;
  email: string | null;
}) {
  const { authUserId, email } = args;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.person.findUnique({
        where: { id: authUserId },
        select: { id: true },
      });

      if (!existing) {
        const realPeopleCount = await tx.person.count({
          where: { id: { notIn: [...SYSTEM_PERSON_IDS] } },
        });
        const isFirstUser = realPeopleCount === 0;
        const grantAdmin = shouldGrantFirstUserAdmin({
          isFirstUser,
          email: normalizedEmail,
        });

        await tx.person.upsert({
          where: { id: authUserId },
          create: {
            id: authUserId,
            firstName: "",
            lastName: "",
            isAdmin: grantAdmin,
            lastLoginAt: new Date(),
          },
          update: { lastLoginAt: new Date() },
        });
      } else {
        await tx.person.update({
          where: { id: authUserId },
          data: { lastLoginAt: new Date() },
        });
      }

      if (normalizedEmail) {
        const existingEmail = await tx.emailAddress.findUnique({
          where: { address: normalizedEmail },
          select: { personId: true },
        });

        if (!existingEmail) {
          const personEmailCount = await tx.emailAddress.count({
            where: { personId: authUserId },
          });
          try {
            await tx.emailAddress.create({
              data: {
                personId: authUserId,
                address: normalizedEmail,
                kind: "personal",
                isPrimary: personEmailCount === 0,
                isVerified: true,
                verifiedAt: new Date(),
              },
            });
          } catch (createErr) {
            // Concurrent insert raced ahead. Re-check to confirm and move on.
            const exists = await tx.emailAddress.findUnique({
              where: { address: normalizedEmail },
              select: { personId: true },
            });
            if (!exists) {
              console.error(
                "[ensurePerson] emailAddress.create failed and address still missing",
                createErr,
              );
              throw createErr;
            }
          }
        } else if (existingEmail.personId !== authUserId) {
          console.warn(
            `[ensurePerson] email ${normalizedEmail} is owned by another person ${existingEmail.personId}, ignoring for ${authUserId}`,
          );
        }
      }
    });
  } catch (err) {
    console.error("[ensurePerson] transaction failed", {
      authUserId,
      email: normalizedEmail,
      err,
    });
    throw err;
  }
}
