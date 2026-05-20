/**
 * Resolve the WhatsApp/Email targets a coach or admin can pick from
 * when they tap a contact button next to a person on a roster.
 *
 * The shape we return is deliberately flat ({@link ContactTarget}) so
 * the UI doesn't have to know whether a target came from the person's
 * own phone, the parent in their household, or the emergency contact
 * row. Each target carries enough metadata for the dropdown to render
 * a useful label like "Mom — Emma de Vries · Mother".
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** A single contactable destination shown in the picker dropdown. */
export interface ContactTarget {
  /**
   * Stable id within a single picker (`person:<uuid>:phone`,
   * `emergency:<uuid>`). Not stable across server requests — used only
   * for React keys.
   */
  key: string;
  /** Headline label, e.g. "Emma de Vries" or "Emergency contact". */
  label: string;
  /** Sub-label, e.g. "Mother" or "Father · primary parent". */
  description: string | null;
  /** Raw phone string as stored. `null` when WhatsApp isn't possible. */
  phone: string | null;
  /** Primary email if any. `null` when email isn't possible. */
  email: string | null;
  /**
   * Hint at why we're showing this entry. Useful for the UI to put a
   * subtle pill ("self", "parent", "emergency") next to each row.
   */
  origin: "self" | "guardian" | "household_adult" | "emergency";
}

/** Aggregated contact info for one roster row. */
export interface PersonContactGroup {
  personId: string;
  personLabel: string;
  /**
   * The person whose roster row this is — useful for the prefill
   * message ("re: {child name}"). Same as `personLabel` for adult rows.
   */
  subjectName: string;
  targets: ContactTarget[];
}

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelationship: true,
  emails: {
    where: { archivedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { address: true, isPrimary: true },
  },
  householdMember: {
    select: {
      roleInHousehold: true,
      household: {
        select: {
          id: true,
          members: {
            select: {
              roleInHousehold: true,
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  emails: {
                    where: { archivedAt: null },
                    orderBy: [
                      { isPrimary: "desc" },
                      { createdAt: "asc" },
                    ],
                    select: { address: true, isPrimary: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PersonSelect;

type PersonRowSelect = Prisma.PersonGetPayload<{
  select: typeof PERSON_SELECT;
}>;

function pickPrimaryEmail(
  emails: Array<{ address: string; isPrimary: boolean }>,
): string | null {
  if (emails.length === 0) return null;
  const primary = emails.find((e) => e.isPrimary);
  return primary?.address ?? emails[0]?.address ?? null;
}

function buildTargetsFromRow(row: PersonRowSelect): PersonContactGroup {
  const fullName = `${row.firstName} ${row.lastName}`.trim();
  const targets: ContactTarget[] = [];

  // 1) The person themselves — only when adult-ish (we don't WhatsApp
  //    children directly even if a phone is on file).
  const isChild = row.householdMember?.roleInHousehold === "child";
  if (!isChild) {
    const selfEmail = pickPrimaryEmail(row.emails);
    if (row.phone || selfEmail) {
      targets.push({
        key: `self:${row.id}`,
        label: fullName || "Self",
        description: "Direct line",
        phone: row.phone,
        email: selfEmail,
        origin: "self",
      });
    }
  }

  // 2) Other adults in the same household — these are the parents /
  //    guardians for child rows, and partner/spouse for adult rows.
  const householdAdults =
    row.householdMember?.household.members.filter(
      (m) =>
        m.roleInHousehold !== "child" && m.person.id !== row.id,
    ) ?? [];
  for (const m of householdAdults) {
    const adultEmail = pickPrimaryEmail(m.person.emails);
    if (!m.person.phone && !adultEmail) continue;
    targets.push({
      key: `house:${m.person.id}`,
      label: `${m.person.firstName} ${m.person.lastName}`.trim(),
      description: isChild ? "Parent / guardian" : "Household adult",
      phone: m.person.phone,
      email: adultEmail,
      origin: isChild ? "guardian" : "household_adult",
    });
  }

  // 3) Free-text emergency contact (no email — we don't store one).
  if (row.emergencyContactPhone || row.emergencyContactName) {
    const relPart = row.emergencyContactRelationship
      ? ` · ${row.emergencyContactRelationship}`
      : "";
    targets.push({
      key: `emergency:${row.id}`,
      label: row.emergencyContactName || "Emergency contact",
      description: `Emergency${relPart}`,
      phone: row.emergencyContactPhone,
      email: null,
      origin: "emergency",
    });
  }

  return {
    personId: row.id,
    personLabel: fullName,
    subjectName: fullName,
    targets,
  };
}

/**
 * Build a contact group for any single person — works for adults,
 * coaches, parents, and standalone people. Use this on detail pages
 * (admin person hero, coach profile drawer).
 */
export async function getPersonContacts(
  personId: string,
): Promise<PersonContactGroup | null> {
  const row = await prisma.person.findUnique({
    where: { id: personId },
    select: PERSON_SELECT,
  });
  if (!row) return null;
  return buildTargetsFromRow(row);
}

/**
 * Same shape as {@link getPersonContacts} but for a roster row that
 * represents a *student* — i.e. you want to message the people
 * responsible for them. For adult students the targets are the same as
 * for the underlying person; for children the picker prioritises the
 * household guardians plus the emergency contact and skips the child's
 * own phone.
 */
export async function getStudentContacts(
  studentPersonId: string,
): Promise<PersonContactGroup | null> {
  return getPersonContacts(studentPersonId);
}

/**
 * Bulk variant for rosters. Returns one entry per personId in input
 * order; missing rows are silently skipped.
 */
export async function getStudentContactsBulk(
  personIds: string[],
): Promise<PersonContactGroup[]> {
  if (personIds.length === 0) return [];
  const rows = await prisma.person.findMany({
    where: { id: { in: personIds } },
    select: PERSON_SELECT,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return personIds
    .map((id) => byId.get(id))
    .filter((r): r is PersonRowSelect => Boolean(r))
    .map(buildTargetsFromRow);
}
