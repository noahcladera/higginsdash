"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useActionFeedback } from "@/lib/feedback";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/inbox/actions";
import type { InboxItem } from "@/lib/inbox/queries";

/*
 * Optimistic-state action shape:
 *
 *   { kind: "one", id }  → flip a single notification to "read".
 *   { kind: "all" }      → flip every unread notification to "read".
 *
 * Server actions still run in the background; the optimistic reducer just
 * paints the UI immediately so the click feels instant. We deliberately
 * skip `router.refresh()` for these toggles (`refresh: false` below) —
 * the optimistic state already reflects the only visible change. The
 * sidebar unread badge corrects itself on the next real navigation
 * thanks to the `revalidatePath` calls in the server actions.
 */
type OptimisticAction = { kind: "one"; id: string } | { kind: "all" };

/**
 * Three things this component renders:
 *
 *   1. Unread strip with a "mark all read" button when there's anything
 *      unread.
 *   2. The newest 50 in-app notifications, grouped visually by read state.
 *   3. A deep link to the row that the notification is about (whenever we
 *      know how to build one — see `linkForRelated`).
 *
 * Notifications older than the cutoff are not paginated; the queries
 * helper hard-caps to 50 because in practice every action also pings via
 * email and the in-app feed is meant to be the "what just changed?"
 * surface, not an archive.
 */
export function InboxFeed({
  items,
  basePath,
}: {
  items: InboxItem[];
  /** Used to highlight the currently active inbox in router refresh hints. */
  basePath: "/portal" | "/coach" | "/admin";
}) {
  const [optimisticItems, applyOptimistic] = React.useOptimistic(
    items,
    (current: InboxItem[], action: OptimisticAction) => {
      const now = new Date();
      if (action.kind === "all") {
        return current.map((i) => (i.readAt ? i : { ...i, readAt: now }));
      }
      return current.map((i) =>
        i.id === action.id && !i.readAt ? { ...i, readAt: now } : i,
      );
    },
  );
  const unread = optimisticItems.filter((i) => !i.readAt);

  const markAll = useActionFeedback({
    success: "Marked all as read",
    refresh: false,
  });
  const markOne = useActionFeedback({ silentSuccess: true, refresh: false });

  if (optimisticItems.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description="We'll drop a note in your inbox whenever something needs your attention."
      />
    );
  }

  return (
    <div className="space-y-3">
      {unread.length > 0 && (
        <div className="elev-panel flex items-center justify-between rounded-[var(--radius-md)] px-4 py-2.5">
          <p className="text-sm">
            <strong>{unread.length}</strong>{" "}
            {unread.length === 1 ? "new update" : "new updates"}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.pending}
            onClick={() => {
              // `useOptimistic` updates must be applied inside a
              // transition (React 19). `markAll.run` itself uses
              // `startTransition`, so wrapping the optimistic update in
              // a sibling `startTransition` keeps both inside the same
              // concurrent render and avoids the dev-mode warning.
              React.startTransition(() => {
                applyOptimistic({ kind: "all" });
              });
              markAll.run(() => markAllNotificationsRead());
            }}
          >
            {markAll.pending ? "..." : "Mark all read"}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {optimisticItems.map((item) => {
          const href = linkForRelated(item, basePath);
          return (
            <li
              key={item.id}
              className={
                "elev-card p-4 " +
                (item.readAt
                  ? "bg-[var(--surface-muted,_var(--surface))] opacity-80"
                  : "bg-[var(--surface)]")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.readAt && (
                      <Badge tone="triaz" variant="soft">
                        New
                      </Badge>
                    )}
                    <h3 className="text-sm font-semibold leading-tight">
                      {item.subject ??
                        prettifyTemplate(item.templateKey) ??
                        "Update"}
                    </h3>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-[var(--foreground)]/80">
                    {item.body}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {formatRelative(item.createdAt)}
                    {item.readAt
                      ? ` · read ${formatRelative(item.readAt)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {href && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!item.readAt) {
                          React.startTransition(() => {
                            applyOptimistic({ kind: "one", id: item.id });
                          });
                          markOne.run(() =>
                            markNotificationRead({
                              notificationId: item.id,
                            }),
                          );
                        }
                      }}
                    >
                      <Link href={href}>Open</Link>
                    </Button>
                  )}
                  {!item.readAt && !href && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={markOne.pending}
                      onClick={() => {
                        React.startTransition(() => {
                          applyOptimistic({ kind: "one", id: item.id });
                        });
                        markOne.run(() =>
                          markNotificationRead({ notificationId: item.id }),
                        );
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Map a notification's related row to a deep link in the right workspace.
 *
 * Aim: every notification that refers to "another part of the portal"
 * gets a one-click Open button. When we have the IDs to drill into a
 * specific row (transfer request, payment, class roster, session) we
 * do; otherwise we fall back to the most relevant queue/list page so
 * the recipient is still one click away from acting on it.
 *
 * Returning `null` keeps the row visible without an Open button — only
 * used for cases where the notification truly is informational with no
 * other place to go (e.g. a coach being told a sub was assigned still
 * sees it on the dashboard, but if the related row was deleted we'd
 * rather not link to a 404).
 */
function linkForRelated(
  item: InboxItem,
  basePath: "/portal" | "/coach" | "/admin",
): string | null {
  const t = item.relatedTable;
  const id = item.relatedRowId;
  const seriesId = item.relatedClassSeriesId;
  const sessionId = item.relatedClassSessionId;
  const programSlug = item.relatedProgramSlug;
  if (!t || !id) return null;

  if (basePath === "/admin") {
    if (t === "class_transfer_requests") return `/admin/transfers/${id}`;
    if (t === "coach_sub_requests") return `/admin/coach-subs`;
    if (t === "court_bookings") return `/admin/bookings/deletions`;
    if (t === "memberships") return `/admin/memberships/cancellations`;
    if (t === "recurring_blocks") return `/admin/blocks/requests`;
    if (t === "payments") return `/admin/payments/${id}`;
    if (t === "enrollments") {
      return seriesId ? `/admin/classes/${seriesId}` : `/admin/payments`;
    }
    if (t === "household_credits") return `/admin/households`;
    if (t === "attendance") {
      return seriesId ? `/admin/classes/${seriesId}` : null;
    }
  }
  if (basePath === "/coach") {
    if (t === "coach_sub_requests") return `/coach`;
    if (t === "court_bookings") return `/coach/bookings`;
    if (t === "recurring_blocks") return `/coach/bookings`;
    if (t === "class_series") {
      return seriesId ? `/coach/classes/${seriesId}` : `/coach/classes`;
    }
    if (
      item.templateKey === "coach.levels.reminder.medals" ||
      item.templateKey === "coach.levels.reminder.skills"
    ) {
      return seriesId ? `/coach/classes/${seriesId}` : `/coach/classes`;
    }
    if (t === "enrollments") {
      return seriesId ? `/coach/classes/${seriesId}` : `/coach/classes`;
    }
    if (t === "attendance") {
      if (seriesId && sessionId) {
        return `/coach/classes/${seriesId}/sessions/${sessionId}`;
      }
      return `/coach/calendar`;
    }
    if (t === "class_sessions") return `/coach/calendar`;
    if (t === "class_transfer_requests") return null;
  }
  if (basePath === "/portal") {
    if (t === "court_bookings") return `/portal/bookings`;
    if (t === "memberships") return `/portal/membership`;
    if (t === "enrollments") return `/portal/classes`;
    if (t === "payments") return `/portal/payments`;
    if (t === "class_transfer_requests") return `/portal/classes`;
    if (t === "household_credits") return `/portal/credits`;
    if (t === "students") return `/portal/family`;
    if (t === "class_updates") {
      if (programSlug && seriesId) {
        return `/portal/programs/${programSlug}/${seriesId}#updates`;
      }
      return `/portal/family`;
    }
  }
  if (basePath === "/coach") {
    if (t === "class_updates" && seriesId) {
      return `/coach/classes/${seriesId}`;
    }
  }
  return null;
}

function prettifyTemplate(key: string): string {
  return key
    .split(".")
    .pop()
    ?.replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? key;
}

function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
