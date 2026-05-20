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
import { getCurrentBrand } from "@/lib/tenant";

export default async function AdminSchoolsPage() {
  await requireAdmin();

  const [schools, brand] = await Promise.all([
    prisma.school.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { classSeries: true } },
      },
    }),
    getCurrentBrand(),
  ]);

  const activeCount = schools.filter((s) => s.isActive).length;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title="Schools"
        description="Partner schools we run programs with. Pickup logistics and onsite delivery details live here."
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/schools/new">
              <PlusIcon /> New school
            </Link>
          </Button>
        }
      />

      <Section
        title={`${activeCount} active`}
        description={
          schools.length === activeCount
            ? "Nothing archived."
            : `${schools.length - activeCount} archived`
        }
      >
        {schools.length === 0 ? (
          <EmptyState
            icon={<MapPinIcon size={20} />}
            title="No schools yet"
            description="Add a pickup school so afterschool classes can point at it."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/admin/schools/new">New school</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right tabular">
                    Staff at {brand.shortName}
                  </TableHead>
                  <TableHead className="text-right tabular">Classes</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((s) => (
                  <TableRow
                    key={s.id}
                    className={cn(
                      !s.isActive &&
                        "border-l-[3px] border-l-[var(--border-strong)] bg-[var(--surface)]",
                    )}
                  >
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {s.slug}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {s.coachArriveAtHubMinutes}m before pickup
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {s._count.classSeries}
                    </TableCell>
                    <TableCell className="text-right">
                      {!s.isActive && (
                        <Badge tone="neutral" variant="soft" className="mr-2">
                          archived
                        </Badge>
                      )}
                      <Link
                        href={`/admin/schools/${s.id}`}
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
