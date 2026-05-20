import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon, MapPinIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";

export default async function AdminVenuesPage() {
  await requireAdmin();
  const t = await getTerms();

  const venues = await prisma.venue.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      club: { select: { name: true } },
      _count: { select: { classSeries: true } },
    },
  });

  const activeCount = venues.filter((v) => v.isActive).length;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={t.venue.plural}
        description={`All the places a ${t.class.singular.toLowerCase()} can happen. Pickup and ${t.coach.singular.toLowerCase()}-arrive timing lives on schools, not here.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/venues/new">
              <PlusIcon /> New {t.venue.singular.toLowerCase()}
            </Link>
          </Button>
        }
      />

      <Section
        title={`${activeCount} active`}
        description={
          venues.length === activeCount
            ? "Nothing archived."
            : `${venues.length - activeCount} archived`
        }
      >
        {venues.length === 0 ? (
          <EmptyState
            icon={<MapPinIcon size={20} />}
            title={`No ${t.venue.plural.toLowerCase()} yet`}
            description={`Create the physical sites so ${t.class.plural.toLowerCase()} can point at them.`}
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/admin/venues/new">New venue</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Linked club</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right tabular">Classes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venues.map((v) => (
                  <TableRow
                    key={v.id}
                    className={cn(
                      !v.isActive &&
                        "border-l-[3px] border-l-[var(--border-strong)] bg-[var(--surface)]",
                    )}
                  >
                    <TableCell>
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {v.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={kindTone(v.kind)}
                        variant="soft"
                        className="capitalize"
                      >
                        {kindLabel(v.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {v.club?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-[var(--muted-foreground)]">
                      {v.city ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {v._count.classSeries}
                    </TableCell>
                    <TableCell className="text-right">
                      {!v.isActive && (
                        <Badge tone="neutral" variant="soft" className="mr-2">
                          archived
                        </Badge>
                      )}
                      <Link
                        href={`/admin/venues/${v.id}`}
                        className="text-xs underline hover:text-[var(--accent)]"
                      >
                        edit
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}

function kindLabel(kind: "club" | "school" | "rented_court"): string {
  switch (kind) {
    case "club":
      return "Club";
    case "school":
      return "School";
    case "rented_court":
      return "Rented court";
  }
}

function kindTone(
  kind: "club" | "school" | "rented_court",
): "triaz" | "joint" | "neutral" {
  switch (kind) {
    case "club":
      return "triaz";
    case "school":
      return "joint";
    case "rented_court":
      return "neutral";
  }
}
