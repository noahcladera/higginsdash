import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { AdminListToolbar } from "@/components/admin/admin-list-toolbar";
import { Button } from "@/components/ui/button";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { parseListParams } from "@/lib/admin/list-params";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { PeopleDirectory } from "./_components/people-directory";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getTerms();
  const brand = await getCurrentBrand();
  const sp = await searchParams;
  const { q, page, showArchived, pageSize } = parseListParams(sp);

  const archivedFilter: Prisma.PersonWhereInput = showArchived
    ? { archivedAt: { not: null } }
    : { archivedAt: null };

  const searchFilter: Prisma.PersonWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          {
            emails: {
              some: { address: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      }
    : {};

  const where: Prisma.PersonWhereInput = { AND: [archivedFilter, searchFilter] };
  const activeWhere: Prisma.PersonWhereInput = { archivedAt: null };

  const [total, rows, admins, coaches, students, archivedCount] =
    await Promise.all([
      prisma.person.count({ where }),
      prisma.person.findMany({
        where,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          isAdmin: true,
          archivedAt: true,
          emails: {
            where: { archivedAt: null },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { address: true },
          },
          householdMember: {
            select: {
              household: { select: { id: true, displayName: true } },
            },
          },
          student: { select: { personId: true } },
          coach: { select: { personId: true } },
        },
      }),
      prisma.person.count({
        where: { ...activeWhere, isAdmin: true },
      }),
      prisma.person.count({
        where: { ...activeWhere, coach: { isNot: null } },
      }),
      prisma.person.count({
        where: { ...activeWhere, student: { isNot: null } },
      }),
      prisma.person.count({ where: { archivedAt: { not: null } } }),
    ]);

  const contactGroups = await getStudentContactsBulk(rows.map((r) => r.id));
  const contactsByPersonId = new Map(
    contactGroups.map((g) => [g.personId, g]),
  );

  const flatSearchParams: Record<string, string | undefined> = {
    q: sp.q as string | undefined,
    archived: sp.archived as string | undefined,
  };

  const directoryRows = rows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    isAdmin: p.isAdmin,
    archivedAt: p.archivedAt,
    primaryEmail: p.emails[0]?.address ?? null,
    household: p.householdMember?.household ?? null,
    isCoach: !!p.coach,
    isStudent: !!p.student,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="People"
        description={`All ${t.member.plural.toLowerCase()}, ${t.parent.plural.toLowerCase()}, ${t.student.plural.toLowerCase()}, ${t.coach.plural.toLowerCase()}, and admins.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/people/new">+ New person</Link>
          </Button>
        }
      />

      <AdminListToolbar
        searchPlaceholder="Search by name or email…"
        showArchived={showArchived}
        searchParams={flatSearchParams}
      />

      <PeopleDirectory
        rows={directoryRows}
        stats={{
          total,
          admins,
          coaches,
          students,
          archived: archivedCount,
        }}
        showArchived={showArchived}
        query={q}
        page={page}
        pageSize={pageSize}
        searchParams={flatSearchParams}
        brandName={brand.shortName}
        contactsByPersonId={contactsByPersonId}
      />
    </div>
  );
}
