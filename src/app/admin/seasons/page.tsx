import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";
import { NewSeasonForm } from "./_new-season-form";
import { SeasonRowActions } from "./_row-actions";
import type { SeasonEditRow } from "./_edit-season-dialog";

/**
 * Admin seasons catalog — manual labels for grouping class series.
 */
export default async function AdminSeasonsPage() {
  await requireAdmin();
  const t = await getTerms();

  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { classSeries: true } } },
  });

  const active = seasons.filter((s) => s.isActive);
  const archived = seasons.filter((s) => !s.isActive);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={t.season.plural}
        description={`Labels that group ${t.class.plural.toLowerCase()} and feed into auto-generated class names. Pick one when creating a ${t.class.singular.toLowerCase()}; enrollment windows stay on each class.`}
      />

      <Section
        title={`New ${t.season.singular.toLowerCase()}`}
        description={`Create a season, set the audience, and name it.`}
      >
        <NewSeasonForm />
      </Section>

      <Section
        title={`Active (${active.length})`}
        description={
          active.length === 0
            ? `Nothing active — the ${t.season.singular.toLowerCase()} dropdown on the ${t.class.singular.toLowerCase()} form will be empty.`
            : `These appear when creating or editing a ${t.class.singular.toLowerCase()}.`
        }
      >
        {active.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title={`No active ${t.season.plural.toLowerCase()}`}
            description={`Create one above so admins can tag ${t.class.plural.toLowerCase()}.`}
          />
        ) : (
          <SeasonTable rows={active} />
        )}
      </Section>

      {archived.length > 0 && (
        <Section
          title={`Archived (${archived.length})`}
          description="Hidden from the dropdown but still attached to historical class series."
        >
          <SeasonTable rows={archived} muted />
        </Section>
      )}
    </div>
  );
}

type SeasonRow = Awaited<
  ReturnType<typeof prisma.season.findMany>
>[number] & { _count: { classSeries: number } };

function toEditRow(s: SeasonRow): SeasonEditRow {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    audience: s.audience,
    startsOn: s.startsOn ? dateToISO(s.startsOn) : null,
    endsOn: s.endsOn ? dateToISO(s.endsOn) : null,
    notes: s.notes,
  };
}

function SeasonTable({ rows, muted }: { rows: SeasonRow[]; muted?: boolean }) {
  return (
    <div
      className={
        muted
          ? "overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)] opacity-75"
          : "overflow-hidden rounded-[var(--radius-md)] bg-[var(--card)]"
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Audience</TableHead>
            <TableHead>Window</TableHead>
            <TableHead className="text-right tabular">Used by</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {s.slug}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  tone={s.audience === "youth" ? "triaz" : "neutral"}
                  variant="soft"
                  className="capitalize"
                >
                  {s.audience}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-[var(--muted-foreground)] tabular">
                {s.startsOn && s.endsOn
                  ? `${formatDate(s.startsOn)} → ${formatDate(s.endsOn)}`
                  : "—"}
              </TableCell>
              <TableCell className="tabular text-right">
                {s._count.classSeries}
              </TableCell>
              <TableCell className="text-right">
                <SeasonRowActions
                  season={toEditRow(s)}
                  isActive={s.isActive}
                  inUseCount={s._count.classSeries}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
