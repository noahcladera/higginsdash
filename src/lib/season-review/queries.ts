/**
 * Season-end review gating: which series are within the 14-day
 * end-of-season window with enrollments still missing a coach decision?
 *
 * Used by:
 *
 *   - `/coach/classes/[seriesId]`  banner ("review pending for X / Y")
 *   - `/admin/inbox`              "Season-end reviews due" tile
 *
 * The window mirrors the spec: anything from `now - 7d` to `now + 14d`
 * — a series that ended last week and still has un-reviewed enrollments
 * is the most urgent. We cap the window so a series that ended six
 * months ago doesn't bleed into the worklist forever.
 */

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { classSeriesClubScope } from "@/lib/coach/club-scope";

const WINDOW_AHEAD_DAYS = 14;
const WINDOW_BEHIND_DAYS = 7;

function reviewWindow(now = new Date()) {
  const earliest = new Date(now.getTime() - WINDOW_BEHIND_DAYS * 86_400_000);
  const latest = new Date(now.getTime() + WINDOW_AHEAD_DAYS * 86_400_000);
  return { earliest, latest };
}

export interface SeriesReviewSummary {
  seriesId: string;
  seriesName: string;
  endsOn: Date;
  enrollmentsMissingReview: number;
  totalActiveEnrollments: number;
}

/**
 * Series in the review window where the calling coach is still on the
 * hook. Excludes series with zero un-reviewed active enrollments.
 */
export async function getSeriesNeedingReviewForCoach(
  coachPersonId: string,
  opts: { allowedClubIds?: string[] | null } = {},
): Promise<SeriesReviewSummary[]> {
  const { earliest, latest } = reviewWindow();

  const clubScope = classSeriesClubScope(opts.allowedClubIds ?? null);
  const series = await prisma.classSeries.findMany({
    where: {
      endsOn: { gte: earliest, lte: latest },
      status: { in: ["published", "full", "in_progress", "completed"] },
      coaches: { some: { coachPersonId } },
      ...clubScope,
    },
    select: {
      id: true,
      name: true,
      endsOn: true,
      enrollments: {
        where: { status: "active", levelReview: { is: null } },
        select: { id: true },
      },
      _count: {
        select: { enrollments: { where: { status: "active" } } },
      },
    },
    orderBy: { endsOn: "asc" },
  });

  return series
    .map((s) => ({
      seriesId: s.id,
      seriesName: s.name,
      endsOn: s.endsOn,
      enrollmentsMissingReview: s.enrollments.length,
      totalActiveEnrollments: s._count.enrollments,
    }))
    .filter((s) => s.enrollmentsMissingReview > 0);
}

/**
 * Per-series view used by the coach roster banner: list every active
 * enrollment that still doesn't have a review row, with a short
 * payload for the inline action buttons.
 */
export async function getEnrollmentsNeedingReview(seriesId: string) {
  return prisma.enrollment.findMany({
    where: {
      classSeriesId: seriesId,
      status: "active",
      levelReview: { is: null },
    },
    select: {
      id: true,
      studentPersonId: true,
      student: {
        select: {
          skillLevel: true,
          medalLevel: true,
          person: {
            select: {
              firstName: true,
              lastName: true,
              dateOfBirth: true,
            },
          },
        },
      },
    },
    orderBy: { student: { person: { firstName: "asc" } } },
  });
}

/**
 * Cluster-wide count for the admin inbox tile. Mirrors the coach's
 * window but doesn't filter by ownership — admins see everything that
 * needs to land before parents start asking.
 */
export const getAdminSeasonReviewsDue = cache(_getAdminSeasonReviewsDue);
async function _getAdminSeasonReviewsDue(): Promise<number> {
  const { earliest, latest } = reviewWindow();
  return prisma.enrollment.count({
    where: {
      status: "active",
      levelReview: { is: null },
      classSeries: {
        endsOn: { gte: earliest, lte: latest },
        status: { in: ["published", "full", "in_progress", "completed"] },
      },
    },
  });
}
