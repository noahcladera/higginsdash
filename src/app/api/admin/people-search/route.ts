import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/people-search?q=...&exclude_in_household=1&household_id=...
 *
 * Used by the PersonPicker component on household forms. Returns up to 20
 * people matching the query.
 *
 * Query params:
 *   q                       free text (matches first/last name + email)
 *   exclude_in_household    if "1", omit anyone already attached to a household
 *   household_id            if set, ALSO include people in THIS household
 *                           (used by the primary-contact picker on edit)
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const excludeInHousehold =
    url.searchParams.get("exclude_in_household") === "1";
  const householdId = url.searchParams.get("household_id");

  // Require a real search term so the endpoint can't be used to dump the
  // member directory with an empty query.
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const conditions: Prisma.PersonWhereInput[] = [{ archivedAt: null }];

  if (q) {
    conditions.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        {
          emails: {
            some: { address: { contains: q, mode: "insensitive" } },
          },
        },
      ],
    });
  }

  if (excludeInHousehold) {
    conditions.push({
      OR: [
        { householdMember: { is: null } },
        ...(householdId
          ? [{ householdMember: { is: { householdId } } }]
          : []),
      ],
    });
  }

  const rows = await prisma.person.findMany({
    where: { AND: conditions },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emails: {
        where: { archivedAt: null, isPrimary: true },
        select: { address: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    results: rows.map((p) => ({
      id: p.id,
      name: [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "(no name)",
      email: p.emails[0]?.address ?? null,
    })),
  });
}
