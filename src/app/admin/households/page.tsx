import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { AdminListToolbar } from "@/components/admin/admin-list-toolbar";
import { Button } from "@/components/ui/button";
import { getTerms } from "@/lib/tenant";
import { parseListParams } from "@/lib/admin/list-params";
import { HouseholdDirectory } from "./_components/household-directory";

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getTerms();
  const sp = await searchParams;
  const { q, page, showArchived, pageSize } = parseListParams(sp);

  const archivedFilter: Prisma.HouseholdWhereInput = showArchived
    ? { archivedAt: { not: null } }
    : { archivedAt: null };

  const searchFilter: Prisma.HouseholdWhereInput = q
    ? {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          {
            primaryContact: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                {
                  emails: {
                    some: { address: { contains: q, mode: "insensitive" } },
                  },
                },
              ],
            },
          },
        ],
      }
    : {};

  const where: Prisma.HouseholdWhereInput = {
    AND: [archivedFilter, searchFilter],
  };

  const [total, rows, archivedCount] = await Promise.all([
    prisma.household.count({ where }),
    prisma.household.findMany({
      where,
      orderBy: [{ displayName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        displayName: true,
        city: true,
        archivedAt: true,
        primaryContact: {
          select: { firstName: true, lastName: true },
        },
        _count: { select: { members: true } },
      },
    }),
    prisma.household.count({ where: { archivedAt: { not: null } } }),
  ]);

  const flatSearchParams: Record<string, string | undefined> = {
    q: sp.q as string | undefined,
    archived: sp.archived as string | undefined,
  };

  const directoryRows = rows.map((h) => ({
    id: h.id,
    displayName: h.displayName,
    city: h.city,
    archivedAt: h.archivedAt,
    primaryContactName:
      [h.primaryContact.firstName, h.primaryContact.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "—",
    memberCount: h._count.members,
  }));

  const emptyCount = directoryRows.filter((h) => h.memberCount === 0).length;
  const totalMembers = directoryRows.reduce((sum, h) => sum + h.memberCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title={t.household.plural}
        description={`${t.household.plural} that ${t.membership.plural.toLowerCase()} and ${t.enrollment.plural.toLowerCase()} are sold to.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/households/new">
              + New {t.household.singular.toLowerCase()}
            </Link>
          </Button>
        }
      />

      <AdminListToolbar
        searchPlaceholder="Search by name, contact, or email…"
        showArchived={showArchived}
        searchParams={flatSearchParams}
      />

      <HouseholdDirectory
        rows={directoryRows}
        stats={{
          total,
          totalMembers,
          emptyCount,
          archived: archivedCount,
        }}
        showArchived={showArchived}
        query={q}
        householdLabel={t.household.plural}
        page={page}
        pageSize={pageSize}
        searchParams={flatSearchParams}
      />
    </div>
  );
}
