import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

/**
 * Admin payments list with two queues:
 *
 *   1. Refund-required: enrollments / memberships flagged with
 *      `refund_requested_at` (set by the cancellation / withdrawal flows)
 *      that don't yet have a refund recorded against the linked payment.
 *
 *   2. Recent payments: a chronological list with status badges so the
 *      office can find any payment to record a manual refund against.
 *
 * Both surfaces link into the per-payment detail page where the refund
 * form lives.
 */
export default async function AdminPaymentsPage() {
  await requireAdmin();

  const [refundFlagsEnrollments, refundFlagsMemberships, recentPayments] =
    await Promise.all([
      prisma.enrollment.findMany({
        where: { refundRequestedAt: { not: null } },
        orderBy: { refundRequestedAt: "asc" },
        include: {
          student: {
            include: {
              person: { select: { firstName: true, lastName: true } },
            },
          },
          classSeries: { select: { id: true, name: true } },
          payment: {
            select: {
              id: true,
              description: true,
              amount: true,
              status: true,
              refunds: { select: { amount: true } },
            },
          },
        },
      }),
      prisma.membership.findMany({
        where: { refundRequestedAt: { not: null } },
        orderBy: { refundRequestedAt: "asc" },
        include: {
          household: { select: { displayName: true } },
          assignedPerson: { select: { firstName: true, lastName: true } },
          paymentLines: {
            select: {
              payment: {
                select: {
                  id: true,
                  description: true,
                  amount: true,
                  status: true,
                  refunds: { select: { amount: true } },
                },
              },
            },
          },
        },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          paidByPerson: {
            select: { firstName: true, lastName: true },
          },
          paidByHousehold: { select: { displayName: true } },
          refunds: { select: { amount: true } },
        },
      }),
    ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Payments" }]} />
      <PageHeader
        kicker="Admin · Finance"
        title="Payments & refunds"
        description="Record manual refunds, work the refund-required queue, and find any payment to take action on."
      />

      <Section
        title={`Needs refund (${
          refundFlagsEnrollments.length + refundFlagsMemberships.length
        })`}
        description="Cancellations and withdrawals that flagged a paid line for refund. Click a row to record one."
      >
        {refundFlagsEnrollments.length === 0 &&
        refundFlagsMemberships.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nothing flagged. The cancellation flows automatically clear this
            list when a refund is recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {refundFlagsEnrollments.map((e) => {
              const payment = e.payment ?? null;
              return (
                <RefundFlagRow
                  key={`e-${e.id}`}
                  kind="Class withdrawal"
                  who={`${e.student.person.firstName} ${e.student.person.lastName}`.trim()}
                  what={e.classSeries.name}
                  flaggedAt={e.refundRequestedAt}
                  reason={e.refundRequestedReason}
                  payment={payment}
                />
              );
            })}
            {refundFlagsMemberships.map((m) => {
              const payment = m.paymentLines[0]?.payment ?? null;
              const who =
                m.household.displayName ||
                (m.assignedPerson
                  ? `${m.assignedPerson.firstName} ${m.assignedPerson.lastName}`.trim()
                  : "Household");
              return (
                <RefundFlagRow
                  key={`m-${m.id}`}
                  kind="Membership cancel"
                  who={who}
                  what={`${m.coverageTier} membership`}
                  flaggedAt={m.refundRequestedAt}
                  reason={null}
                  payment={payment}
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Recent payments"
        description="Last 50, newest first. Click a row to view detail and record a refund."
      >
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--muted)]/30 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Paid by</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recentPayments.map((p) => {
                const refunded = p.refunds.reduce(
                  (acc, r) => acc + Number(r.amount),
                  0,
                );
                return (
                  <tr key={p.id} className="hover:bg-[var(--surface-strong)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/payments/${p.id}`}
                        className="font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                      >
                        {p.description}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {p.paidByHousehold?.displayName ??
                        `${p.paidByPerson.firstName} ${p.paidByPerson.lastName}`.trim()}
                    </td>
                    <td className="px-4 py-3 tabular">
                      €{Number(p.amount).toFixed(2)}
                      {refunded > 0 && (
                        <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                          (€{refunded.toFixed(2)} refunded)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 tabular text-xs text-[var(--muted-foreground)]">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </td>
                  </tr>
                );
              })}
              {recentPayments.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]"
                  >
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function RefundFlagRow({
  kind,
  who,
  what,
  flaggedAt,
  reason,
  payment,
}: {
  kind: string;
  who: string;
  what: string;
  flaggedAt: Date | null;
  reason: string | null;
  payment: {
    id: string;
    description: string;
    amount: unknown;
    status: string;
    refunds: { amount: unknown }[];
  } | null;
}) {
  const refunded = payment
    ? payment.refunds.reduce((acc, r) => acc + Number(r.amount), 0)
    : 0;
  const remaining = payment ? Number(payment.amount) - refunded : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="min-w-0">
        <div className="text-sm font-semibold">
          {who}
          <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
            · {what}
          </span>
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          <Badge tone="warning" variant="soft" className="mr-2">
            {kind}
          </Badge>
          Flagged {flaggedAt ? formatDate(flaggedAt) : "—"}
          {reason ? ` · "${reason}"` : ""}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {payment ? (
          <>
            <span className="tabular text-sm">
              €{remaining?.toFixed(2) ?? "0.00"}
            </span>
            <Link
              href={`/admin/payments/${payment.id}`}
              className="text-sm font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
            >
              Record refund →
            </Link>
          </>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">
            No payment on file
          </span>
        )}
      </div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":
      return <Badge tone="success">Paid</Badge>;
    case "pending":
    case "open":
    case "authorized":
      return <Badge tone="warning">Pending</Badge>;
    case "failed":
    case "expired":
    case "canceled":
      return <Badge tone="danger">{status}</Badge>;
    case "refunded":
      return <Badge tone="neutral">Refunded</Badge>;
    case "charged_back":
      return <Badge tone="danger">Charged back</Badge>;
    default:
      return (
        <Badge variant="outline" className="capitalize">
          {status.replace("_", " ")}
        </Badge>
      );
  }
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
