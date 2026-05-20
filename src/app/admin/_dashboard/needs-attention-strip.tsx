import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon } from "@/components/icons";
import type { AdminPendingCounts } from "@/lib/inbox/queries";

/**
 * Inline row of "needs admin decision" chips, only rendered when at
 * least one queue is non-empty. Mirrors the queues from
 * `src/app/admin/inbox/page.tsx` (and `getAdminPendingCounts`) so the
 * dashboard and the inbox sidebar agree on what counts as work.
 */
export function NeedsAttentionStrip({ pending }: { pending: AdminPendingCounts }) {
  if (pending.total === 0) return null;

  const items: Array<{ count: number; label: string; href: string }> = [
    {
      count: pending.coachSubs,
      label: pending.coachSubs === 1 ? "sub request" : "sub requests",
      href: "/admin/coach-subs",
    },
    {
      count: pending.bookingDeletions,
      label:
        pending.bookingDeletions === 1
          ? "deletion approval"
          : "deletion approvals",
      href: "/admin/bookings/deletions",
    },
    {
      count: pending.membershipCancellations,
      label:
        pending.membershipCancellations === 1
          ? "cancellation"
          : "cancellations",
      href: "/admin/memberships/cancellations",
    },
    {
      count: pending.refundFlags,
      label: pending.refundFlags === 1 ? "refund flag" : "refund flags",
      href: "/admin/payments",
    },
    {
      count: pending.blockRequests,
      label:
        pending.blockRequests === 1 ? "block request" : "block requests",
      href: "/admin/blocks/requests",
    },
    {
      count: pending.trialInterests,
      label:
        pending.trialInterests === 1 ? "trial request" : "trial requests",
      href: "/admin/trial-interest",
    },
    {
      count: pending.enrollmentReviews,
      label:
        pending.enrollmentReviews === 1
          ? "age-band review"
          : "age-band reviews",
      href: "/admin/enrollments/reviews",
    },
  ].filter((i) => i.count > 0);

  return (
    <div className="fade-in flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[oklch(0.30_0.10_75)]">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
        Needs you
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)]/70 px-3 py-1 text-sm transition-colors hover:bg-[var(--surface)]"
          >
            <Badge tone="warning" variant="soft" className="px-2 py-0">
              {i.count}
            </Badge>
            <span>{i.label}</span>
            <ArrowRightIcon
              size={14}
              className="opacity-50 transition-opacity group-hover:opacity-100"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
