import Link from "next/link";

import { formatCreditAmount } from "@/lib/credits/format";
import { ArrowRightIcon } from "@/components/icons";

/**
 * Slim "you have credit on file" strip. Renders nothing when the
 * balance is non-positive so callers can mount it unconditionally and
 * the dashboard stays quiet for new members.
 *
 * Surfaces:
 *   - Portal overview (`/portal`)
 *   - Program catalog (`/portal/programs`)
 *
 * The series detail page already shows a "use your credit" toggle
 * inside `<EnrollPanel>`, so we don't need a strip there.
 */
export function CreditStrip({
  balanceCents,
  linkHref = "/portal/credits",
}: {
  balanceCents: number;
  linkHref?: string;
}) {
  if (balanceCents <= 0) return null;
  const formatted = formatCreditAmount(balanceCents);
  return (
    <Link
      href={linkHref}
      className="group flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--triaz)]/30 bg-[var(--triaz)]/5 px-4 py-3 text-sm transition-colors hover:bg-[var(--triaz)]/10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[var(--triaz-ink)] tabular">
          {formatted}
        </span>
        <span className="text-[var(--foreground)]">
          of lesson credit on your account
        </span>
        <span className="text-xs text-[var(--muted-foreground)]">
          Apply at checkout, or sign up for another season.
        </span>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--triaz-ink)]">
        View ledger
        <ArrowRightIcon
          size={14}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
