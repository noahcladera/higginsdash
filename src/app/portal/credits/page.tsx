import { requireMember } from "@/lib/auth/require-member";
import { PortalPageHeader } from "@/components/portal/portal-page-header";
import { Section } from "@/components/ui/section";
import { Stat, MetricStrip } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { CardIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  formatCreditAmount,
  getHouseholdCreditBalanceCents,
  getHouseholdCreditLedger,
  type CreditLedgerEntry,
} from "@/lib/credits";

/**
 * Read-only ledger of household lesson credits.
 *
 * Credits live at the household level. Positive rows are credit
 * granted (transfer remainder, refund-as-credit, manual office gift);
 * negative rows are credit spent at lesson checkout. Memberships
 * never appear here — that's a hard policy.
 */
export default async function PortalCreditsPage() {
  const { householdId } = await requireMember();
  const balanceCents = householdId
    ? await getHouseholdCreditBalanceCents(householdId)
    : 0;
  const entries = householdId
    ? await getHouseholdCreditLedger(householdId, 100)
    : [];

  return (
    <div className="space-y-8">
      <PortalPageHeader
        kicker="Household account"
        title="Lesson credit"
        description="Money on file you can spend on future lessons. We never refund a class without offering a credit option first."
      />

      <MetricStrip>
        <Stat
          label="Available credit"
          value={formatCreditAmount(balanceCents)}
          hint="Applied automatically at lesson checkout."
        />
        <Stat
          label="Ledger entries"
          value={entries.length.toString()}
          hint="Most recent 100 movements."
        />
      </MetricStrip>

      <Section
        title="Recent activity"
        description="One row per credit movement. Negative rows are credit you spent on a lesson."
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={<CardIcon />}
            title="No credit yet"
            description="Once we credit your household — for example after a class transfer — you'll see the running ledger here."
          />
        ) : (
          <ul className="grouped-section list-none divide-y divide-[var(--content-separator)] p-0 m-0">
            {entries.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function LedgerRow({ entry }: { entry: CreditLedgerEntry }) {
  const isCredit = entry.amountCents > 0;
  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge tone={isCredit ? "success" : "neutral"} variant="soft">
            {labelFor(entry.reason)}
          </Badge>
          <span className="text-[11px] text-[var(--muted-foreground)] tabular">
            {formatDate(entry.createdAt)}
          </span>
        </div>
        {entry.note && (
          <div className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            {entry.note}
          </div>
        )}
      </div>
      <div
        className={cn(
          "shrink-0 font-display text-base font-medium tracking-tight tabular",
          isCredit
            ? "text-[var(--success)]"
            : "text-[var(--foreground)]",
        )}
      >
        {formatCreditAmount(entry.amountCents)}
      </div>
    </li>
  );
}

function labelFor(reason: CreditLedgerEntry["reason"]): string {
  switch (reason) {
    case "transfer_remainder":
      return "Class transfer";
    case "withdrawal_refund":
      return "Refund as credit";
    case "admin_adjustment":
      return "Office adjustment";
    case "enrollment_payment":
      return "Spent on lesson";
  }
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}
