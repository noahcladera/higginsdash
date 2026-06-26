/**
 * Inbox queries shared by /portal/inbox, /coach/inbox, /admin/inbox.
 *
 * V1 reads from the `notifications` table — every notify() call lands a
 * row that's immediately rendered as a feed entry. The recipient marks
 * a row as read; the unread count drives the sidebar badge.
 *
 * For admins we additionally count "pending decisions" (booking deletion
 * requests, sub requests, membership cancellations, refund flags) so the
 * inbox doubles as a real worklist.
 */

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { getAdminSeasonReviewsDue } from "@/lib/season-review/queries";

export interface InboxItem {
  id: string;
  templateKey: string;
  subject: string | null;
  body: string;
  channel: string;
  relatedTable: string | null;
  relatedRowId: string | null;
  /**
   * Resolved server-side for `relatedTable in (enrollments,
   * class_transfer_requests, attendance)` so the client-side link
   * builder can deep-link to the right class roster without doing
   * its own DB calls. Null when the row was deleted or the table
   * doesn't have a series association.
   */
  relatedClassSeriesId: string | null;
  /**
   * Resolved server-side for `relatedTable === "attendance"` so the
   * coach can jump straight to the session detail page.
   */
  relatedClassSessionId: string | null;
  /**
   * Resolved server-side for `relatedTable === "class_updates"` so the
   * inbox row can deep-link into `/portal/programs/<slug>/<seriesId>`.
   * Null when the underlying update was archived.
   */
  relatedProgramSlug: string | null;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * Admin/coach-only notification templates excluded from the member
 * portal inbox — parents should not see operational queue items.
 */
export const PORTAL_EXCLUDED_TEMPLATE_KEYS = [
  "booking.cancellation.requested",
  "membership.cancellation.requested",
  "coach.sub.requested",
  "transfer.requested.admin",
  "enrollment.removed.byOffice",
  "enrollment.removed.coach",
  "enrollment.withdrawn.coach",
  "recurring_block.denied",
  "recurring_block.approved",
] as const;

/**
 * Member-facing inbox — filters admin/coach operational notifications.
 */
export const getMemberInbox = cache(_getMemberInbox);
async function _getMemberInbox(recipientPersonId: string): Promise<InboxItem[]> {
  const items = await getInbox(recipientPersonId);
  const excluded = new Set<string>(PORTAL_EXCLUDED_TEMPLATE_KEYS);
  return items.filter((item) => !excluded.has(item.templateKey));
}

/**
 * Unread count for the portal sidebar badge (member-relevant only).
 */
export const getMemberUnreadCount = cache(_getMemberUnreadCount);
async function _getMemberUnreadCount(
  recipientPersonId: string | null,
): Promise<number> {
  if (!recipientPersonId) return 0;
  return prisma.notification.count({
    where: {
      recipientPersonId,
      channel: "in_app",
      readAt: null,
      templateKey: { notIn: [...PORTAL_EXCLUDED_TEMPLATE_KEYS] },
    },
  });
}

/**
 * Latest 50 in-app notifications for one recipient, newest first.
 */
// `React.cache` deduplicates this fetch within a single request — the
// inbox layout and inbox page would otherwise both hit the DB.
export const getInbox = cache(_getInbox);
async function _getInbox(recipientPersonId: string): Promise<InboxItem[]> {
  const rows = await prisma.notification.findMany({
    where: {
      recipientPersonId,
      channel: "in_app",
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Bucket related ids per table so we can resolve the few we need
  // (series id from enrollment / transfer-request, session id +
  // series id from attendance, series id + program slug for class
  // updates) in a couple of batch queries.
  const enrollmentIds = new Set<string>();
  const transferRequestIds = new Set<string>();
  const attendanceIds = new Set<string>();
  const classUpdateIds = new Set<string>();
  for (const r of rows) {
    if (!r.relatedRowId) continue;
    if (r.relatedTable === "enrollments") enrollmentIds.add(r.relatedRowId);
    else if (r.relatedTable === "class_transfer_requests")
      transferRequestIds.add(r.relatedRowId);
    else if (r.relatedTable === "attendance")
      attendanceIds.add(r.relatedRowId);
    else if (r.relatedTable === "class_updates")
      classUpdateIds.add(r.relatedRowId);
  }

  const [enrollments, transferRequests, attendance, classUpdates] = await Promise.all([
    enrollmentIds.size > 0
      ? prisma.enrollment.findMany({
          where: { id: { in: [...enrollmentIds] } },
          select: { id: true, classSeriesId: true },
        })
      : Promise.resolve([]),
    transferRequestIds.size > 0
      ? prisma.classTransferRequest.findMany({
          where: { id: { in: [...transferRequestIds] } },
          select: {
            id: true,
            fromEnrollment: { select: { classSeriesId: true } },
          },
        })
      : Promise.resolve([]),
    attendanceIds.size > 0
      ? prisma.attendance.findMany({
          where: { id: { in: [...attendanceIds] } },
          select: {
            id: true,
            classSessionId: true,
            classSession: { select: { classSeriesId: true } },
          },
        })
      : Promise.resolve([]),
    classUpdateIds.size > 0
      ? prisma.classUpdate.findMany({
          where: { id: { in: [...classUpdateIds] } },
          select: {
            id: true,
            classSeriesId: true,
            classSeries: {
              select: { program: { select: { slug: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const enrollmentSeries = new Map(
    enrollments.map((e) => [e.id, e.classSeriesId]),
  );
  const transferSeries = new Map(
    transferRequests.map((t) => [t.id, t.fromEnrollment.classSeriesId]),
  );
  const attendanceSession = new Map(
    attendance.map((a) => [a.id, a.classSessionId]),
  );
  const attendanceSeries = new Map(
    attendance.map((a) => [a.id, a.classSession.classSeriesId]),
  );
  const classUpdateSeries = new Map(
    classUpdates.map((u) => [u.id, u.classSeriesId]),
  );
  const classUpdateProgramSlug = new Map(
    classUpdates.map((u) => [u.id, u.classSeries.program?.slug ?? null]),
  );

  return rows.map((r) => {
    let relatedClassSeriesId: string | null = null;
    let relatedClassSessionId: string | null = null;
    let relatedProgramSlug: string | null = null;
    if (r.relatedRowId) {
      if (r.relatedTable === "enrollments") {
        relatedClassSeriesId = enrollmentSeries.get(r.relatedRowId) ?? null;
      } else if (r.relatedTable === "class_transfer_requests") {
        relatedClassSeriesId = transferSeries.get(r.relatedRowId) ?? null;
      } else if (r.relatedTable === "attendance") {
        relatedClassSeriesId = attendanceSeries.get(r.relatedRowId) ?? null;
        relatedClassSessionId = attendanceSession.get(r.relatedRowId) ?? null;
      } else if (r.relatedTable === "class_updates") {
        relatedClassSeriesId = classUpdateSeries.get(r.relatedRowId) ?? null;
        relatedProgramSlug =
          classUpdateProgramSlug.get(r.relatedRowId) ?? null;
      } else if (r.relatedTable === "class_series") {
        relatedClassSeriesId = r.relatedRowId;
      }
    }
    return {
      id: r.id,
      templateKey: r.templateKey,
      subject: r.subject,
      body: r.bodyText,
      channel: r.channel,
      relatedTable: r.relatedTable,
      relatedRowId: r.relatedRowId,
      relatedClassSeriesId,
      relatedClassSessionId,
      relatedProgramSlug,
      createdAt: r.createdAt,
      readAt: r.readAt,
    };
  });
}

/**
 * Number of unread in-app notifications for the sidebar badge.
 */
// `React.cache` so the badge in the layout and any same-request reader
// share one query.
export const getUnreadCount = cache(_getUnreadCount);
async function _getUnreadCount(
  recipientPersonId: string | null,
): Promise<number> {
  if (!recipientPersonId) return 0;
  return prisma.notification.count({
    where: {
      recipientPersonId,
      channel: "in_app",
      readAt: null,
    },
  });
}

export interface AdminPendingCounts {
  bookingDeletions: number;
  coachSubs: number;
  membershipCancellations: number;
  refundFlags: number;
  blockRequests: number;
  trialInterests: number;
  /** Heather feedback v1: enrollments past the age band awaiting office sign-off. */
  enrollmentReviews: number;
  /** Pending parent-initiated class transfer requests. */
  classTransfers: number;
  /**
   * Active enrollments inside the season-end review window
   * (`series.endsOn` between -7d and +14d) without an
   * `enrollment_level_reviews` row yet — coaches need to
   * confirm or move every student.
   */
  seasonReviews: number;
  total: number;
}

/**
 * Counts of all "needs admin decision" rows across the codebase.
 * Used to drive the admin inbox + nav badge.
 */
// `React.cache` so the admin layout and the admin inbox page (which
// both call this) only fire the 6 counts once per request.
export const getAdminPendingCounts = cache(_getAdminPendingCounts);
async function _getAdminPendingCounts(): Promise<AdminPendingCounts> {
  const [
    bookingDeletions,
    coachSubs,
    membershipCancellations,
    refundEnrollments,
    refundMemberships,
    blockRequests,
    trialInterests,
    enrollmentReviews,
    classTransfers,
    seasonReviews,
  ] = await Promise.all([
    prisma.courtBooking.count({
      where: { status: "cancellation_requested" },
    }),
    prisma.coachSubRequest.count({ where: { status: "pending" } }),
    prisma.membership.count({
      where: { status: "active", cancellationRequestedAt: { not: null } },
    }),
    prisma.enrollment.count({
      where: { refundRequestedAt: { not: null } },
    }),
    prisma.membership.count({
      where: { refundRequestedAt: { not: null } },
    }),
    prisma.recurringBlock.count({
      where: { status: "pending" },
    }),
    prisma.trialInterest.count({
      where: { status: { in: ["new", "in_progress"] } },
    }),
    prisma.enrollment.count({
      where: { requiresReview: true, status: { not: "withdrawn" } },
    }),
    prisma.classTransferRequest.count({
      where: { status: "pending" },
    }),
    getAdminSeasonReviewsDue(),
  ]);

  const refundFlags = refundEnrollments + refundMemberships;
  return {
    bookingDeletions,
    coachSubs,
    membershipCancellations,
    refundFlags,
    blockRequests,
    trialInterests,
    enrollmentReviews,
    classTransfers,
    seasonReviews,
    total:
      bookingDeletions +
      coachSubs +
      membershipCancellations +
      refundFlags +
      blockRequests +
      trialInterests +
      enrollmentReviews +
      classTransfers +
      seasonReviews,
  };
}
