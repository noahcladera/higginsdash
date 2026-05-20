import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/icons";
import { formatRelative } from "./format";
import type { DashboardInboxRow } from "./queries";

/**
 * Compact list of the most recent unread admin notifications. Mirrors
 * the row layout of `src/components/inbox/inbox-feed.tsx` so the
 * dashboard preview and the full inbox page feel like the same surface.
 *
 * Server component on purpose — clicking the deep link triggers a
 * navigation to a page where the notification can be dispatched/marked
 * read; we don't need optimistic state for a 5-row preview.
 */
export function UnreadInbox({ items }: { items: DashboardInboxRow[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon size={20} />}
        title="Inbox zero"
        description="No unread notifications. Nice."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const href = linkForRelated(item);
        const Inner = (
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--surface-strong)]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="triaz" variant="soft">
                  New
                </Badge>
                <h3 className="truncate text-sm font-semibold leading-tight">
                  {item.subject ??
                    prettifyTemplate(item.templateKey) ??
                    "Update"}
                </h3>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-[var(--foreground)]/80">
                {item.body}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {formatRelative(item.createdAt)}
              </p>
            </div>
          </div>
        );
        return (
          <li key={item.id}>
            {href ? <Link href={href}>{Inner}</Link> : Inner}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Dashboard-side mirror of `linkForRelated` from
 * `src/components/inbox/inbox-feed.tsx`. Kept in sync deliberately —
 * if the inbox feed adds a route, mirror it here too.
 */
function linkForRelated(item: DashboardInboxRow): string | null {
  const t = item.relatedTable;
  const id = item.relatedRowId;
  if (!t || !id) return null;
  if (t === "court_bookings") return `/admin/bookings/deletions`;
  if (t === "coach_sub_requests") return `/admin/coach-subs`;
  if (t === "memberships") return `/admin/memberships/cancellations`;
  if (t === "enrollments") return `/admin/payments`;
  if (t === "payments") return `/admin/payments/${id}`;
  if (t === "recurring_blocks") return `/admin/blocks/requests`;
  return null;
}

function prettifyTemplate(key: string): string {
  return (
    key
      .split(".")
      .pop()
      ?.replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) ?? key
  );
}
