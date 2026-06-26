import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Stat, MetricStrip } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Loose UUID v1–v5 shape check. Used to defend the highlight lookup
 * against arbitrary `?highlight=` values without surfacing errors.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Read-only payments overview for the household.
 *
 * Lists Payment rows and invoiced memberships for the signed-in household.
 * New checkouts via Mollie appear here after fulfillment.
 */
export default async function PortalPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { householdId } = await requireMember();
  const sp = (await searchParams) ?? {};
  const highlightRaw = firstString(sp.highlight);
  const highlightId =
    highlightRaw && UUID_RE.test(highlightRaw) ? highlightRaw : null;

  const [payments, invoicedMemberships] = householdId
    ? await Promise.all([
        prisma.payment.findMany({
          where: { paidByHouseholdId: householdId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.membership.findMany({
          where: { householdId, invoiceNumber: { not: null } },
          orderBy: { invoicedAt: "desc" },
        }),
      ])
    : [[], []];

  const isEmpty = payments.length === 0 && invoicedMemberships.length === 0;

  // Build a single chronological timeline of "things you paid for".
  type TimelineItem = {
    key: string;
    when: Date;
    title: string;
    subtitle: string;
    amount: number | null;
    currency: string;
    status: string;
  };
  const timeline: TimelineItem[] = [
    ...payments.map((p) => ({
      key: `p-${p.id}`,
      when: p.paidAt ?? p.createdAt,
      title: p.description,
      subtitle: p.paidAt
        ? `Paid ${formatDate(p.paidAt)}`
        : `Created ${formatDate(p.createdAt)}`,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
    })),
    ...invoicedMemberships.map((m) => ({
      key: `m-${m.id}`,
      when: m.invoicedAt ?? m.startsOn,
      title: `${m.coverageTier === "family" ? "family" : "individual"} membership`,
      subtitle: `${m.invoiceNumber}${
        m.invoicedAt ? ` · sent ${formatDate(m.invoicedAt)}` : ""
      }`,
      amount: m.pricePaid != null ? Number(m.pricePaid) : null,
      currency: "EUR",
      status: "invoiced",
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  const totalPaid = timeline.reduce(
    (acc, t) => (t.amount && t.status !== "invoiced" ? acc + t.amount : acc),
    0,
  );
  const lastPayment = timeline.find((t) => t.amount != null);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Payments"
        title="Receipts & invoices"
        description="Everything we have on file for your household."
      />

      {isEmpty ? (
        <EmptyState
          icon={<CardIcon size={20} />}
          title="Nothing here yet"
          description="Your first receipt appears here after checkout — memberships, lessons, and court bookings all land in this timeline."
          action={
            <Button asChild tone="triaz" size="sm">
              <Link href="/portal/membership#buy">Get a membership</Link>
            </Button>
          }
        />
      ) : (
        <>
          <MetricStrip>
            <Stat
              label="Total paid"
              value={formatMoney(totalPaid, "EUR")}
              hint={timeline.length === 0 ? undefined : "across all receipts"}
              tone="triaz"
            />
            <Stat
              label="On file"
              value={timeline.length || "—"}
              hint="receipts & invoices"
            />
            <Stat
              label="Open invoices"
              value={
                timeline.filter((t) => t.status === "invoiced").length || "—"
              }
              hint="unpaid"
              tone="warning"
            />
            <Stat
              label="Last activity"
              value={lastPayment ? formatShort(lastPayment.when) : "—"}
              hint={lastPayment?.title}
            />
          </MetricStrip>

          <Section
            title="Timeline"
            description="Most recent first. Receipts and invoices in one stream."
          >
            <ul className="elev-card divide-y divide-[var(--border)]">
              {timeline.map((t) => {
                const isHighlighted =
                  highlightId != null && t.key === `p-${highlightId}`;
                return (
                  <li
                    key={t.key}
                    className={cn(
                      "flex items-center gap-4 px-5 py-4 transition-colors",
                      isHighlighted &&
                        "bg-[var(--triaz-soft)] ring-1 ring-inset ring-[var(--triaz)]/40",
                    )}
                  >
                    <div className="w-20 shrink-0">
                      <div className="tabular text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                        {formatShort(t.when)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium capitalize">
                          {t.title}
                        </div>
                        {isHighlighted && (
                          <Badge tone="triaz" variant="solid" className="text-[10px]">
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-[var(--muted-foreground)]">
                        {t.subtitle}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {t.amount != null && (
                        <span
                          className={cn(
                            "tabular font-display text-base font-medium",
                          )}
                        >
                          {formatMoney(t.amount, t.currency)}
                        </span>
                      )}
                      <PaymentStatusBadge status={t.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Need a copy of an invoice? Check here first after checkout — or email
        the office and we&apos;ll send it over.
      </p>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "succeeded":
    case "paid":
      return <Badge tone="success">Paid</Badge>;
    case "pending":
    case "processing":
      return <Badge tone="warning">Pending</Badge>;
    case "failed":
      return <Badge tone="danger">Failed</Badge>;
    case "refunded":
      return <Badge tone="neutral">Refunded</Badge>;
    case "invoiced":
      return <Badge tone="warning">Invoiced</Badge>;
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

function formatShort(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
  }).format(d);
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
