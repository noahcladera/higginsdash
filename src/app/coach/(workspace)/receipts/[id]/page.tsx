import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { formatEur } from "@/lib/invoicing/private-lesson-rates";
import { PrintReceiptButton } from "./print-button";
import { getCurrentBrand } from "@/lib/tenant";

export const metadata = { title: "Receipt" };

export default async function CoachReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { person } = await requireCoach();
  const brand = await getCurrentBrand();

  const payment = await prisma.payment.findFirst({
    where: { id, paidByPersonId: person.id },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      paidByPerson: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          postalCode: true,
          city: true,
          country: true,
          emails: {
            where: { archivedAt: null },
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: { address: true },
          },
          zzpCoach: { select: { businessName: true, vatNumber: true } },
        },
      },
      refunds: {
        select: { amount: true },
      },
    },
  });
  if (!payment) notFound();

  const subtotal = payment.lines.reduce(
    (sum, l) => sum + Number(l.amount),
    0,
  );
  const refunded = payment.refunds.reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
  const total = Number(payment.amount);
  const isPaid = !!payment.paidAt || payment.status === "paid";

  const billTo = formatBillTo(payment.paidByPerson);
  const email = payment.paidByPerson.emails[0]?.address ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/coach/receipts"
          className="text-sm text-[var(--muted-foreground)] hover:underline"
        >
          ← Back to receipts
        </Link>
        <PrintReceiptButton />
      </div>

      <article className="mx-auto max-w-2xl rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-8 shadow-[var(--shadow-sm)] print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-[var(--border)] pb-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {brand.displayName}
            </div>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight">
              {isPaid ? "Receipt" : "Invoice"}
            </h1>
            <div className="mt-1 text-sm text-[var(--muted-foreground)]">
              {payment.description}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-mono text-xs uppercase text-[var(--muted-foreground)]">
              {payment.invoiceNumber ? `# ${payment.invoiceNumber}` : "—"}
            </div>
            <div className="mt-1 tabular">
              {payment.issuedAt && (
                <div>
                  <span className="text-[var(--muted-foreground)]">
                    Issued
                  </span>{" "}
                  {formatDate(payment.issuedAt)}
                </div>
              )}
              {payment.dueAt && !isPaid && (
                <div>
                  <span className="text-[var(--muted-foreground)]">Due</span>{" "}
                  {formatDate(payment.dueAt)}
                </div>
              )}
              {isPaid && payment.paidAt && (
                <div>
                  <span className="text-[var(--muted-foreground)]">Paid</span>{" "}
                  {formatDate(payment.paidAt)}
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-[var(--border)] py-6 sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              From
            </div>
            <div className="mt-2 text-sm leading-relaxed">
              <div className="font-medium">{brand.displayName}</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Bill to
            </div>
            <div className="mt-2 text-sm leading-relaxed">
              <div className="font-medium">{billTo.name}</div>
              {billTo.businessName && (
                <div className="text-[var(--muted-foreground)]">
                  {billTo.businessName}
                </div>
              )}
              {billTo.address && (
                <div className="text-[var(--muted-foreground)] whitespace-pre-line">
                  {billTo.address}
                </div>
              )}
              {email && (
                <div className="text-[var(--muted-foreground)]">{email}</div>
              )}
              {billTo.vatNumber && (
                <div className="text-[var(--muted-foreground)]">
                  VAT: {billTo.vatNumber}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pl-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payment.lines.length === 0 ? (
                <tr>
                  <td className="py-3 pr-4">{payment.description}</td>
                  <td className="py-3 pl-4 text-right tabular-nums">
                    {formatEur(total)}
                  </td>
                </tr>
              ) : (
                payment.lines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-[var(--border)] last:border-b-0 align-top"
                  >
                    <td className="py-3 pr-4 whitespace-pre-line">
                      {l.description}
                    </td>
                    <td className="py-3 pl-4 text-right tabular-nums">
                      {formatEur(Number(l.amount))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 pr-4 text-right text-[var(--muted-foreground)]">
                  Subtotal
                </td>
                <td className="pt-4 pl-4 text-right tabular-nums">
                  {formatEur(subtotal)}
                </td>
              </tr>
              {refunded > 0 && (
                <tr>
                  <td className="pt-1 pr-4 text-right text-[var(--muted-foreground)]">
                    Refunded
                  </td>
                  <td className="pt-1 pl-4 text-right tabular-nums text-[var(--muted-foreground)]">
                    −{formatEur(refunded)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="pt-2 pr-4 text-right font-medium">Total</td>
                <td className="pt-2 pl-4 text-right tabular-nums font-display text-lg font-medium">
                  {formatEur(total - refunded)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <footer className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
          <div>
            Status:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {isPaid ? "Paid" : payment.status}
            </span>
            {payment.paymentMethod && (
              <span> · via {payment.paymentMethod}</span>
            )}
          </div>
          <div className="mt-1">
            Questions? Reply to the invoice email or contact the office. This
            page is your own copy — print or save it as PDF for your records.
          </div>
        </footer>
      </article>
    </div>
  );
}

function formatBillTo(p: {
  firstName: string;
  lastName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  zzpCoach: { businessName: string | null; vatNumber: string | null } | null;
}): {
  name: string;
  businessName: string | null;
  address: string | null;
  vatNumber: string | null;
} {
  const name =
    [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
  const cityLine = [p.postalCode, p.city].filter(Boolean).join(" ").trim();
  const lines = [
    p.addressLine1,
    p.addressLine2,
    cityLine,
    p.country,
  ].filter(Boolean) as string[];
  return {
    name,
    businessName: p.zzpCoach?.businessName ?? null,
    address: lines.length > 0 ? lines.join("\n") : null,
    vatNumber: p.zzpCoach?.vatNumber ?? null,
  };
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}
