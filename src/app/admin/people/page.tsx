import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/admin/search-input";
import { ArchivedToggle } from "@/components/admin/archived-toggle";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { parseListParams } from "@/lib/admin/list-params";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContactButton } from "@/components/contacts/contact-button";
import { getStudentContactsBulk } from "@/lib/contacts/queries";

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

  // `Promise.all` not `$transaction` — see admin/page.tsx for the full
  // explanation. Display reads don't need transactional isolation,
  // and pgbouncer transaction mode serializes $transaction.
  const [total, rows] = await Promise.all([
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
          select: { address: true, isPrimary: true },
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
  ]);

  // Resolve WhatsApp/Email targets for the visible page in one query so
  // each row can show quick-action buttons next to the name.
  const contactGroups = await getStudentContactsBulk(rows.map((r) => r.id));
  const contactsByPersonId = new Map(
    contactGroups.map((g) => [g.personId, g]),
  );

  const flatSearchParams: Record<string, string | undefined> = {
    q: sp.q as string | undefined,
    archived: sp.archived as string | undefined,
  };

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput placeholder="Search by name or email…" />
        <ArchivedToggle
          showArchived={showArchived}
          searchParams={flatSearchParams}
        />
      </div>

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Primary email</TableHead>
              <TableHead>Household</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                >
                  {q
                    ? `No people match "${q}".`
                    : showArchived
                      ? "No archived people."
                      : "No people yet. Click + New person to add one."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => {
                const fullName =
                  [p.firstName, p.lastName].filter(Boolean).join(" ").trim() ||
                  "(no name)";
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/admin/people/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-[var(--muted-foreground)]">
                      {p.emails[0]?.address ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.householdMember?.household ? (
                        <Link
                          href={`/admin/households/${p.householdMember.household.id}`}
                          className="hover:underline"
                        >
                          {p.householdMember.household.displayName}
                        </Link>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.isAdmin && (
                          <Badge variant="default">admin</Badge>
                        )}
                        {p.coach && <Badge variant="secondary">coach</Badge>}
                        {p.student && (
                          <Badge variant="outline">student</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const group = contactsByPersonId.get(p.id);
                        if (!group) return null;
                        return (
                          <ContactButton
                            group={group}
                            subjectName={fullName}
                            brandName={brand.shortName}
                            size="xs"
                            className="justify-end"
                          />
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        searchParams={flatSearchParams}
      />
    </div>
  );
}
