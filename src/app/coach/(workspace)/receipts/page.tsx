import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { Section } from "@/components/ui/section";
import { GroupedSection, GroupedLinkRow } from "@/components/ui/grouped-list";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptIcon } from "lucide-react";
import { formatEur } from "@/lib/invoicing/private-lesson-rates";
import { getCurrentBrand } from "@/lib/tenant";

export const metadata = { title: "Receipts" };

export default async function CoachReceiptsPage() {
  const { person } = await requireCoach();
  const brand = await getCurrentBrand();

  // AR-style invoices issued to the coach personally (court-rental for
  // private lessons, etc.). These are the docs Heather wants coaches to
  // be able to print and file with their bookkeeping.
  const payments = await prisma.payment.findMany({
    where: {
      paidByPersonId: person.id,
      // Manual / AR invoices have no Mollie ID and use invoiceNumber.
      OR: [
        { invoiceNumber: { not: null } },
        { paidByHouseholdId: null },
      ],
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { lines: true } },
    },
  });

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker="Receipts"
        title="Your receipts & invoices"
        description={`Every invoice ${brand.shortName} has issued to you (court rental, materials, etc.). Open one to view a clean print-ready receipt for your records.`}
      />

      <Section
        title={`Invoices (${payments.length})`}
        description="Sorted by issue date, most recent first."
        surface="card"
      >
        {payments.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title="No receipts yet"
            description="When admin issues an invoice in your name, it will appear here."
          />
        ) : (
          <>
            <div className="lg:hidden">
              <GroupedSection header={`Invoices (${payments.length})`}>
                {payments.map((p) => {
                  const status = paymentStatusBadge(p.status, !!p.paidAt);
                  return (
                    <GroupedLinkRow
                      key={p.id}
                      href={`/coach/receipts/${p.id}`}
                      className="flex-col items-stretch gap-1 py-3"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-xs text-[var(--muted-foreground)]">
                          {p.invoiceNumber ?? "—"}
                        </span>
                        <Badge tone={status.tone} variant="soft">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="font-medium">{p.description}</div>
                      <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                        <span>
                          {p.issuedAt ? formatDate(p.issuedAt) : "—"}
                        </span>
                        <span className="tabular-nums font-medium text-[var(--foreground)]">
                          {formatEur(Number(p.amount))}
                        </span>
                      </div>
                    </GroupedLinkRow>
                  );
                })}
              </GroupedSection>
            </div>
            <div className="-mx-2 hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const status = paymentStatusBadge(p.status, !!p.paidAt);
                  return (
                    <tr
                      key={p.id}
                      className="rounded-lg bg-[var(--surface-strong)]"
                    >
                      <td className="rounded-l-lg px-3 py-3 font-mono text-xs">
                        {p.invoiceNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{p.description}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {p._count.lines} line
                          {p._count.lines === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--muted-foreground)]">
                        {p.issuedAt ? formatDate(p.issuedAt) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={status.tone} variant="soft">
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">
                        {formatEur(Number(p.amount))}
                      </td>
                      <td className="rounded-r-lg px-3 py-3 text-right">
                        <Link
                          href={`/coach/receipts/${p.id}`}
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--card)]"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function paymentStatusBadge(
  status: string,
  isPaid: boolean,
): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (isPaid || status === "paid") return { label: "Paid", tone: "success" };
  if (status === "open" || status === "pending")
    return { label: "Open", tone: "warning" };
  if (status === "failed" || status === "expired")
    return { label: status, tone: "danger" };
  if (status === "refunded") return { label: "Refunded", tone: "neutral" };
  return { label: status, tone: "neutral" };
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
