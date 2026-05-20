import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCoachesWithUnbilledCourtTime,
  resolveMonthPeriod,
  type CoachRoleKind,
} from "@/lib/admin/private-lessons-queries";
import { formatEur } from "@/lib/invoicing/private-lesson-rates";
import { getTerms } from "@/lib/tenant";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

/**
 * Admin overview of coach private-lesson court time owed.
 *
 * Period defaults to the current month in Amsterdam. Admins can
 * step month-by-month with prev/next; each coach row shows their
 * unbilled minutes/euros for the period and links through to a
 * detail page for selecting which items to invoice.
 */
export default async function AdminPrivateLessonsPage({
  searchParams,
}: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const terms = await getTerms();

  const { periodStart, periodEnd, iso, label } = resolveMonthPeriod(sp.period);
  const prev = shiftMonth(iso, -1);
  const next = shiftMonth(iso, 1);

  const rows = await getCoachesWithUnbilledCourtTime(periodStart, periodEnd);
  const totalEur = rows.reduce((s, r) => s + r.totalEur, 0);
  const totalMinutes = rows.reduce((s, r) => s + r.totalMinutes, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Finance"
        title={terms.privateLesson.plural}
        description={`Per-staff ${terms.privateLesson.singular.toLowerCase()} billing. Select a ${terms.coach.singular.toLowerCase()} to set their rate, review unbilled ${terms.privateLesson.plural.toLowerCase()}, and generate an invoice.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/private-lessons?period=${prev}`}>← Prev</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/private-lessons">This month</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/private-lessons?period=${next}`}>Next →</Link>
            </Button>
          </div>
        }
      />

      <Section
        title={label}
        description={
          rows.length === 0
            ? `No unbilled ${terms.court.singular.toLowerCase()} time in this period.`
            : `${rows.length} ${terms.coach.singular.toLowerCase()}${rows.length === 1 ? "" : "s"} · ${Math.round(
                totalMinutes / 60,
              )} h ${totalMinutes % 60} m · ${formatEur(totalEur)} owed`
        }
        surface="card"
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to invoice"
            description={`No ${terms.coach.singular.toLowerCase()} has unbilled ${terms.privateLesson.singular.toLowerCase()} ${terms.court.singular.toLowerCase()} time for this period.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{terms.coach.singular}</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">One-off lessons</TableHead>
                <TableHead className="text-right">Recurring occurrences</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.coachPersonId}>
                  <TableCell className="font-medium">
                    {r.firstName} {r.lastName}
                  </TableCell>
                  <TableCell>
                    <RoleBadge kind={r.roleKind} />
                  </TableCell>
                  <TableCell className="text-[var(--muted-foreground)]">
                    {r.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.oneOffCount > 0 ? (
                      <Badge variant="outline">{r.oneOffCount}</Badge>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.recurringOccurrenceCount > 0 ? (
                      <Badge variant="outline">
                        {r.recurringOccurrenceCount}
                      </Badge>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.totalMinutes}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatEur(r.totalEur)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" asChild>
                      <Link
                        href={`/admin/private-lessons/${r.coachPersonId}?period=${iso}`}
                      >
                        Review →
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function RoleBadge({ kind }: { kind: CoachRoleKind }) {
  const label = kind === "both" ? "HTN + ZZP" : kind === "zzp" ? "ZZP" : "HTN";
  const tone: "success" | "joint" = kind === "staff" ? "success" : "joint";
  return (
    <Badge tone={tone} variant="soft">
      {label}
    </Badge>
  );
}

function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}
