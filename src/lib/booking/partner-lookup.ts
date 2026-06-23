"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Heather feedback v1: when a Triaz member books a court, the partner
 * field needs to resolve to *another Triaz member* (so we can spot
 * "always playing with non-members" patterns and so the partner appears
 * on their own /portal/book screen). For Randwijck the office is happy
 * with free-text — they don't track partners that strictly.
 *
 * Implementation: a thin name-prefix search over `Person` filtered to
 * people with an active membership covering Triaz. Only logged-in
 * members can call this, since exposing the member directory anonymously
 * is a privacy concern.
 */

const SearchInput = z.object({
  /** Triaz / randwijck. We only support triaz today but pass through. */
  clubSlug: z.enum(["triaz", "randwijck"]),
  /** Free text query. Empty/short → empty array (no point hammering DB). */
  query: z.string().trim().min(2).max(60),
  /** Cap so the dropdown doesn't render forever on common surnames. */
  limit: z.number().int().min(1).max(20).default(8),
});

export interface PartnerCandidate {
  personId: string;
  name: string;
  /** First letter of email or first name — used for the dropdown avatar. */
  initial: string;
  /** Optional disambiguator under the name (e.g. household name). */
  hint: string | null;
}

export type PartnerSearchResult =
  | { ok: true; candidates: PartnerCandidate[] }
  | { ok: false; error: string };

export async function searchClubMembers(
  raw: z.input<typeof SearchInput>,
): Promise<PartnerSearchResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to search partners." };

  // Only real members / coaches / admins may enumerate the member directory.
  // Orphan accounts (auth user with no household/coach/student/admin) must not.
  const me = await prisma.person.findUnique({
    where: { id: user.id },
    select: {
      isAdmin: true,
      householdMember: { select: { id: true } },
      coach: { select: { personId: true } },
      zzpCoach: { select: { personId: true } },
      student: { select: { personId: true } },
    },
  });
  const isRealMember =
    !!me &&
    (me.isAdmin ||
      !!me.householdMember ||
      !!me.coach ||
      !!me.zzpCoach ||
      !!me.student);
  if (!isRealMember) {
    return { ok: false, error: "Not allowed." };
  }

  const parsed = SearchInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Type at least two letters." };
  }
  const { clubSlug, query, limit } = parsed.data;

  const tokens = query
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  // Build a `name LIKE %tok%` AND chain so a multi-word query (`Anna Bok`)
  // hits "Anna Bokma" but not "Anna Smith" / "Bokma family".
  const nameWhere = tokens.map((t) => ({
    OR: [
      { firstName: { contains: t, mode: "insensitive" as const } },
      { lastName: { contains: t, mode: "insensitive" as const } },
    ],
  }));

  const rows = await prisma.person.findMany({
    where: {
      archivedAt: null,
      // Exclude the searcher themselves so we don't suggest "book with me".
      NOT: { id: user.id },
      AND: [
        ...nameWhere,
        {
          // Active membership covering this club.
          householdMember: {
            household: {
              memberships: {
                some: {
                  status: "active",
                  expiresOn: { gte: new Date() },
                  membershipClubs: {
                    some: {
                      club: { slug: clubSlug },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      householdMember: {
        select: {
          household: { select: { displayName: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
  });

  const candidates: PartnerCandidate[] = rows.map((r) => {
    const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Member";
    return {
      personId: r.id,
      name,
      initial: name.slice(0, 1).toUpperCase(),
      hint: r.householdMember?.household.displayName ?? null,
    };
  });
  return { ok: true, candidates };
}

/**
 * Admin front-desk search: members with active coverage at a club.
 * Same shape as `searchClubMembers` but callable only by admins and
 * does not exclude the searcher (the admin is never the booker).
 */
export async function searchMembersForAdminBooking(
  raw: z.input<typeof SearchInput>,
): Promise<PartnerSearchResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to search members." };

  const admin = await prisma.person.findUnique({
    where: { id: user.id },
    select: { isAdmin: true, archivedAt: true },
  });
  if (!admin?.isAdmin || admin.archivedAt) {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = SearchInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Type at least two letters." };
  }
  const { clubSlug, query, limit } = parsed.data;

  const tokens = query
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const nameWhere = tokens.map((t) => ({
    OR: [
      { firstName: { contains: t, mode: "insensitive" as const } },
      { lastName: { contains: t, mode: "insensitive" as const } },
    ],
  }));

  const rows = await prisma.person.findMany({
    where: {
      archivedAt: null,
      AND: [
        ...nameWhere,
        {
          householdMember: {
            household: {
              memberships: {
                some: {
                  status: "active",
                  expiresOn: { gte: new Date() },
                  membershipClubs: {
                    some: {
                      club: { slug: clubSlug },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      householdMember: {
        select: {
          household: { select: { displayName: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: limit,
  });

  const candidates: PartnerCandidate[] = rows.map((r) => {
    const name = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Member";
    return {
      personId: r.id,
      name,
      initial: name.slice(0, 1).toUpperCase(),
      hint: r.householdMember?.household.displayName ?? null,
    };
  });
  return { ok: true, candidates };
}
