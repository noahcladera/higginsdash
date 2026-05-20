import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/admin/search-input";
import { ArchivedToggle } from "@/components/admin/archived-toggle";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { getTerms } from "@/lib/tenant";
import { parseListParams } from "@/lib/admin/list-params";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  // `Promise.all` not `$transaction` — see admin/page.tsx for the full
  // explanation. With pgbouncer in transaction mode, $transaction
  // serializes both queries on one connection; Promise.all lets them
  // run in parallel against the pool.
  const [total, rows] = await Promise.all([
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
  ]);

  const flatSearchParams: Record<string, string | undefined> = {
    q: sp.q as string | undefined,
    archived: sp.archived as string | undefined,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title={t.household.plural}
        description={`${t.household.plural} that ${t.membership.plural.toLowerCase()} and ${t.enrollment.plural.toLowerCase()} are sold to.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/households/new">+ New {t.household.singular.toLowerCase()}</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput placeholder="Search by name, contact, or email…" />
        <ArchivedToggle
          showArchived={showArchived}
          searchParams={flatSearchParams}
        />
      </div>

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.household.singular}</TableHead>
              <TableHead>Primary contact</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Members</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                >
                  {q
                    ? `No ${t.household.plural.toLowerCase()} match "${q}".`
                    : showArchived
                      ? `No archived ${t.household.plural.toLowerCase()}.`
                      : `No ${t.household.plural.toLowerCase()} yet.`}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((h) => {
                const contact =
                  [h.primaryContact.firstName, h.primaryContact.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "—";
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link
                        href={`/admin/households/${h.id}`}
                        className="font-medium hover:underline"
                      >
                        {h.displayName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{contact}</TableCell>
                    <TableCell className="text-sm text-[var(--muted-foreground)]">
                      {h.city ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {h._count.members}
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
