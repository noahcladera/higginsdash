import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { InboxFeed } from "@/components/inbox/inbox-feed";
import { getAdminPendingCounts, getInbox } from "@/lib/inbox/queries";
import { getTerms } from "@/lib/tenant";

/**
 * Admin inbox.
 *
 * Top half: a worklist of "things to decide" — booking deletions, sub
 * requests, membership cancellations, refund flags, recurring block
 * requests. Each row deep-links into the existing dedicated queue page,
 * so this serves as a daily landing strip without duplicating those
 * surfaces.
 *
 * Bottom half: the in-app notification feed for this admin specifically.
 * Useful for the things admins get pinged about (a coach denied a sub,
 * etc.) that don't fit any queue.
 */
export default async function AdminInboxPage() {
  const { person } = await requireAdmin();
  const [items, pending, terms] = await Promise.all([
    getInbox(person.id),
    getAdminPendingCounts(),
    getTerms(),
  ]);

  const coachPlural = terms.coach.plural.toLowerCase();
  const memberPlural = terms.member.plural.toLowerCase();
  const courtPlural = terms.court.plural.toLowerCase();
  const parentPlural = terms.parent.plural.toLowerCase();

  const queues: Array<{
    href: string;
    label: string;
    description: string;
    count: number;
  }> = [
    {
      href: "/admin/bookings/deletions",
      label: "Booking deletion requests",
      description: `${memberPlural} or ${coachPlural} asked to cancel a booking after the cutoff.`,
      count: pending.bookingDeletions,
    },
    {
      href: "/admin/coach-subs",
      label: `${terms.coach.singular} cover requests`,
      description: `A ${terms.coach.singular.toLowerCase()} cannot make a session and is asking for cover.`,
      count: pending.coachSubs,
    },
    {
      href: "/admin/memberships/cancellations",
      label: "Membership cancellations",
      description: "Members who want to end their membership.",
      count: pending.membershipCancellations,
    },
    {
      href: "/admin/payments",
      label: "Refund flags",
      description: "Withdrawals and cancellations awaiting a manual refund.",
      count: pending.refundFlags,
    },
    {
      href: "/admin/blocks/requests",
      label: "Recurring block requests",
      description: `${terms.coach.plural} asking for new recurring ${courtPlural} blocks.`,
      count: pending.blockRequests,
    },
    {
      href: "/admin/transfers",
      label: `${terms.class.singular} transfer requests`,
      description: `${parentPlural} asking to move a paid ${terms.enrollment.singular.toLowerCase()} into a different ${terms.class.singular.toLowerCase()}.`,
      count: pending.classTransfers,
    },
    {
      href: "/admin/classes",
      label: "Season-end reviews due",
      description:
        `Active ${terms.enrollment.plural.toLowerCase()} inside the end-of-${terms.season.singular.toLowerCase()} window without a ${terms.coach.singular.toLowerCase()} decision yet.`,
      count: pending.seasonReviews,
    },
  ];

  const open = queues.filter((q) => q.count > 0);
  const empty = queues.filter((q) => q.count === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Inbox"
        title="What needs your attention"
        description={
          pending.total === 0
            ? "Inboxes are clear. Nice."
            : `${pending.total} ${pending.total === 1 ? "item" : "items"} waiting on a decision.`
        }
      />

      {open.length > 0 && (
        <Section title="Open queues">
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((q) => (
              <li
                key={q.href}
                className="elev-card p-4"
              >
                <Link
                  href={q.href}
                  className="group flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold group-hover:underline">
                        {q.label}
                      </h3>
                      <Badge tone="warning" variant="soft">
                        {q.count}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {q.description}
                    </p>
                  </div>
                  <span aria-hidden className="text-[var(--muted-foreground)]">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {empty.length > 0 && (
        <Section title="Cleared queues">
          <ul className="grid gap-2 sm:grid-cols-2">
            {empty.map((q) => (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] shadow-[var(--shadow-sm)] hover:text-[var(--foreground)]"
                >
                  <span>{q.label}</span>
                  <Badge tone="success" variant="soft">
                    0
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Recent notifications"
        description="Direct pings to your account — denials, completed actions and so on."
      >
        <InboxFeed items={items} basePath="/admin" />
      </Section>
    </div>
  );
}
