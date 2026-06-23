import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * Read-only "Customer 360" legacy history.
 *
 * The Higgins brain precomputes one dossier per pre-migration household and the
 * `db:import-legacy` script loads them into `legacy_profiles` /
 * `legacy_profile_emails`. Here we resolve a *current* Person or Household (by
 * their email addresses) to that history so the admin UI can show it.
 *
 * This never touches the live CRM — it is reference data only.
 */

export const LegacyPaymentSchema = z.object({
  date: z.string().nullable(),
  student: z.string(),
  class: z.string(),
  status: z.string(),
  paidCents: z.number(),
  refundedCents: z.number(),
});

export const LegacyCalendarSchema = z.object({
  date: z.string().nullable(),
  calendar: z.string(),
  event: z.string(),
});

export const LegacyEmailSchema = z.object({
  date: z.string().nullable(),
  subject: z.string(),
  direction: z.string(),
  sensitivity: z.string(),
  flagged: z.boolean(),
});

export const LegacyProfileDataSchema = z.object({
  payments: z.array(LegacyPaymentSchema).default([]),
  calendar: z.array(LegacyCalendarSchema).default([]),
  emails: z.array(LegacyEmailSchema).default([]),
});

export type LegacyPayment = z.infer<typeof LegacyPaymentSchema>;
export type LegacyCalendar = z.infer<typeof LegacyCalendarSchema>;
export type LegacyEmail = z.infer<typeof LegacyEmailSchema>;
export type LegacyProfileData = z.infer<typeof LegacyProfileDataSchema>;

export interface LegacyProfileView {
  householdKey: string;
  displayName: string;
  memberNames: string[];
  totalPaidCents: number;
  totalRefundedCents: number;
  bookingCount: number;
  emailCount: number;
  complaintCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  data: LegacyProfileData;
}

async function loadByEmails(
  emails: string[],
): Promise<LegacyProfileView | null> {
  const normalized = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalized.length === 0) return null;

  const link = await prisma.legacyProfileEmail.findFirst({
    where: { email: { in: normalized } },
    include: { profile: true },
  });
  if (!link?.profile) return null;

  const p = link.profile;
  const parsed = LegacyProfileDataSchema.safeParse(p.data);
  return {
    householdKey: p.householdKey,
    displayName: p.displayName,
    memberNames: p.memberNames,
    totalPaidCents: p.totalPaidCents,
    totalRefundedCents: p.totalRefundedCents,
    bookingCount: p.bookingCount,
    emailCount: p.emailCount,
    complaintCount: p.complaintCount,
    firstSeen: p.firstSeen,
    lastSeen: p.lastSeen,
    data: parsed.success
      ? parsed.data
      : { payments: [], calendar: [], emails: [] },
  };
}

/** Resolve the legacy history for a person via all their email addresses. */
export async function getLegacyProfileForPerson(
  personId: string,
): Promise<LegacyProfileView | null> {
  const emails = await prisma.emailAddress.findMany({
    where: { personId },
    select: { address: true },
  });
  return loadByEmails(emails.map((e) => e.address));
}

/** Resolve the legacy history for a household via its members' email addresses. */
export async function getLegacyProfileForHousehold(
  householdId: string,
): Promise<LegacyProfileView | null> {
  const members = await prisma.householdMember.findMany({
    where: { householdId },
    select: { person: { select: { emails: { select: { address: true } } } } },
  });
  const emails = members.flatMap((m) =>
    m.person.emails.map((e) => e.address),
  );
  return loadByEmails(emails);
}
