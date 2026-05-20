import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { RefundForm } from "./_refund-form";

export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      paidByPerson: {
        select: { id: true, firstName: true, lastName: true },
      },
      paidByHousehold: { select: { id: true, displayName: true } },
      lines: true,
      refunds: {
        orderBy: { processedAt: "desc" },
        include: {
          processedByPerson: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!payment) notFound();

  const refunded = payment.refunds.reduce(
    (acc, r) => acc + Number(r.amount),
    0,
  );
  const paymentAmount = Number(payment.amount);
  const remaining = paymentAmount - refunded;
  const fullyRefunded = remaining <= 0.001;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Payments", href: "/admin/payments" },
          { label: payment.description },
        ]}
      />
      <PageHeader
        kicker="Admin · Payment"
        title={payment.description}
        description={
          <span className="tabular">
            €{paymentAmount.toFixed(2)} {payment.currency} · {payment.status} ·{" "}
            paid by{" "}
            {payment.paidByHousehold?.displayName ??
              `${payment.paidByPerson.firstName} ${payment.paidByPerson.lastName}`.trim()}
          </span>
        }
      />

      <Section title="Lines" description="What this payment covered.">
        {payment.lines.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No line items recorded.
          </p>
        ) : (
          <ul className="rounded-md border border-[var(--border)]">
            {payment.lines.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2 text-sm last:border-b-0"
              >
                <span>{l.description}</span>
                <span className="tabular">
                  €{Number(l.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Refunds (${payment.refunds.length})`}
        description="Manual refunds recorded by the office. Mollie is not yet wired."
      >
        {payment.refunds.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No refunds recorded.
          </p>
        ) : (
          <ul className="rounded-md border border-[var(--border)]">
            {payment.refunds.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0"
              >
                <div>
                  <div className="font-medium">€{Number(r.amount).toFixed(2)}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {formatDate(r.processedAt)} by{" "}
                    {r.processedByPerson.firstName}{" "}
                    {r.processedByPerson.lastName}
                  </div>
                  <div className="mt-1 text-sm">{r.reason}</div>
                  {r.notes && (
                    <div className="mt-1 text-xs italic text-[var(--muted-foreground)]">
                      {r.notes}
                    </div>
                  )}
                </div>
                {r.mollieRefundId ? (
                  <Badge tone="success" variant="soft">
                    Mollie {r.mollieStatus ?? "pending"}
                  </Badge>
                ) : (
                  <Badge tone="warning" variant="soft">
                    Manual
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Record a refund"
        description={
          fullyRefunded
            ? "This payment is fully refunded."
            : `€${remaining.toFixed(2)} remaining of €${paymentAmount.toFixed(2)}.`
        }
      >
        {fullyRefunded ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted-foreground)]">
            Nothing to refund. <Link href="/admin/payments" className="underline">
              Back to list
            </Link>
          </div>
        ) : (
          <RefundForm
            paymentId={payment.id}
            remaining={remaining}
            currency={payment.currency}
          />
        )}
      </Section>
    </div>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
