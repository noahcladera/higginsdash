import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getCoachMonthLessonGrid,
  getUnbilledCoachLineItems,
  listInvoicesForCoach,
  resolveMonthPeriod,
} from "@/lib/admin/private-lessons-queries";
import { formatEur } from "@/lib/invoicing/private-lesson-rates";
import { InvoiceBuilder } from "./_components/invoice-builder";
import { CourtRateCard } from "./_components/court-rate-card";
import { MonthCalendar } from "./_components/month-calendar";
import { InvoiceHistoryTable } from "./_components/invoice-history-table";

interface PageProps {
  params: Promise<{ coachId: string }>;
  searchParams: Promise<{ period?: string; invoice?: string }>;
}

export default async function AdminCoachPrivateLessonsPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdmin();
  const { coachId } = await params;
  const sp = await searchParams;

  const coach = await prisma.person.findUnique({
    where: { id: coachId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      coach: {
        select: {
          isActive: true,
          courtRentalRate: true,
        },
      },
      zzpCoach: {
        select: {
          isActive: true,
          defaultCourtRentalRate: true,
        },
      },
      emails: {
        where: { isPrimary: true, archivedAt: null },
        select: { address: true },
        take: 1,
      },
    },
  });
  if (
    !coach ||
    (!coach.coach?.isActive && !coach.zzpCoach?.isActive)
  ) {
    notFound();
  }

  const { periodStart, periodEnd, iso, label } = resolveMonthPeriod(sp.period);
  const prev = shiftMonth(iso, -1);
  const next = shiftMonth(iso, 1);

  const [items, invoices, monthGrid] = await Promise.all([
    getUnbilledCoachLineItems(coach.id, periodStart, periodEnd),
    listInvoicesForCoach(coach.id),
    getCoachMonthLessonGrid(coach.id, periodStart, periodEnd),
  ]);

  const isStaff = coach.coach?.isActive ?? false;
  const isZzp = coach.zzpCoach?.isActive ?? false;
  const roleLabel = isStaff && isZzp
    ? "HTN + ZZP"
    : isZzp
      ? "ZZP"
      : "HTN";
  const roleTone: "success" | "joint" = isZzp && !isStaff ? "joint" : "success";

  const unbilledTotal = items.reduce((s, i) => s + i.amount, 0);
  const unbilledMinutes = items.reduce((s, i) => s + i.minutes, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Finance"
        title={
          <span className="inline-flex items-center gap-2">
            {coach.firstName} {coach.lastName}
            <Badge tone={roleTone} variant="soft">
              {roleLabel}
            </Badge>
          </span>
        }
        description={`Unbilled private-lesson court time · ${label}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/private-lessons">← All coaches</Link>
            </Button>
          </div>
        }
      />

      {sp.invoice && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Invoice{" "}
          <span className="font-mono font-medium">{sp.invoice}</span>{" "}
          generated successfully.
        </div>
      )}

      {coach.coach && (
        <CourtRateCard
          kind="staff"
          coachPersonId={coach.id}
          storedOverrideEurPerHour={
            coach.coach.courtRentalRate != null
              ? Number(coach.coach.courtRentalRate)
              : null
          }
        />
      )}
      {coach.zzpCoach && (
        <CourtRateCard
          kind="zzp"
          coachPersonId={coach.id}
          storedOverrideEurPerHour={
            coach.zzpCoach.defaultCourtRentalRate != null
              ? Number(coach.zzpCoach.defaultCourtRentalRate)
              : null
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/private-lessons/${coach.id}?period=${prev}`}>
            ← {prev}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/private-lessons/${coach.id}`}>This month</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/private-lessons/${coach.id}?period=${next}`}>
            {next} →
          </Link>
        </Button>
      </div>

      <MonthCalendar periodIsoMonth={iso} grid={monthGrid} />

      <Section
        title="Unbilled lessons"
        description={
          items.length === 0
            ? "Nothing to invoice for this period."
            : `${items.length} item${items.length === 1 ? "" : "s"} · ${unbilledMinutes} minutes · ${formatEur(unbilledTotal)}`
        }
        surface="card"
      >
        {items.length === 0 ? (
          <EmptyState
            title="All caught up"
            description="This coach has no unbilled lessons in this period."
          />
        ) : (
          <InvoiceBuilder
            coachPersonId={coach.id}
            periodStartUtc={periodStart.toISOString()}
            periodEndUtc={periodEnd.toISOString()}
            periodIso={iso}
            items={items.map((i) => ({
              refId: i.refId,
              kind: i.kind,
              courtName: i.courtName,
              clubName: i.clubName,
              description:
                i.kind === "recurring_occurrence" ? i.description : null,
              startsAtIso:
                i.kind === "one_off"
                  ? i.startsAt.toISOString()
                  : i.occurrenceStartsAt.toISOString(),
              minutes: i.minutes,
              amount: i.amount,
            }))}
          />
        )}
      </Section>

      <Section
        title="History"
        description={
          invoices.length === 0
            ? "No invoices issued to this coach yet."
            : `${invoices.length} past invoice${invoices.length === 1 ? "" : "s"}`
        }
        surface="card"
      >
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Once you generate an invoice it will appear here."
          />
        ) : (
          <InvoiceHistoryTable
            defaultEmail={coach.emails[0]?.address ?? null}
            initiallyExpandedInvoiceNumber={sp.invoice}
            rows={invoices.map((inv) => ({
              paymentId: inv.paymentId,
              invoiceNumber: inv.invoiceNumber,
              amount: inv.amount,
              status: inv.status,
              issuedAtIso: inv.issuedAt ? inv.issuedAt.toISOString() : null,
              description: inv.description,
              lineCount: inv.lineCount,
              checkoutUrl: inv.mollieCheckoutUrl,
            }))}
          />
        )}
      </Section>
    </div>
  );
}

function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}
