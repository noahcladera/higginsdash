import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getTerms } from "@/lib/tenant";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Bookable-spaces catalog page (called "Courts" in tennis tenants,
 * "Studios" / "Classrooms" / "Rooms" in others). Lists spaces grouped
 * by club. The only field that matters operationally is `isBookable`
 * (toggles walk-on-only vs reservable).
 */
export default async function AdminCourtsPage() {
  await requireAdmin();
  const t = await getTerms();
  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      courts: {
        where: { isActive: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={t.court.plural}
        description={`Per-${t.club.singular.toLowerCase()} ${t.court.singular.toLowerCase()} catalog. Toggle bookability when a ${t.court.singular.toLowerCase()} is closed for maintenance.`}
      />
      {clubs.map((club) => (
        <section key={club.id} className="space-y-3">
          <h2 className="font-display text-xl font-medium tracking-tight">
            {club.name}
          </h2>
          <div className="rounded-md border border-[var(--border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Lit</TableHead>
                  <TableHead>Bookable</TableHead>
                  <TableHead>KNLTB</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {club.courts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-[var(--muted-foreground)]"
                    >
                      No courts at this club yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  club.courts.map((court) => (
                    <TableRow key={court.id}>
                      <TableCell className="text-xs tabular-nums text-[var(--muted-foreground)]">
                        {court.displayOrder}
                      </TableCell>
                      <TableCell className="font-medium">
                        {court.name}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted-foreground)]">
                        {court.surface}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--muted-foreground)]">
                        {court.qualityTier}
                      </TableCell>
                      <TableCell>
                        {court.isLit ? (
                          <Badge variant="outline">yes</Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            no
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {court.isBookable ? (
                          <Badge tone="success" variant="soft">
                            bookable
                          </Badge>
                        ) : (
                          <Badge tone="neutral" variant="soft">
                            walk-on only
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {court.isKnltbCertified ? (
                          <Badge variant="outline">certified</Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/courts/${court.id}`}
                          className="text-xs underline hover:text-[var(--accent)]"
                        >
                          edit
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
