/**
 * Read-side helpers for `class_updates`.
 */

import { prisma } from "@/lib/prisma";

export interface ClassUpdateRow {
  id: string;
  classSeriesId: string;
  classSessionId: string | null;
  title: string;
  bodyMarkdown: string;
  videoUrl: string | null;
  videoProvider: "youtube" | "vimeo" | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  postedBy: {
    personId: string;
    firstName: string | null;
    lastName: string | null;
  };
}

const SELECT = {
  id: true,
  classSeriesId: true,
  classSessionId: true,
  title: true,
  bodyMarkdown: true,
  videoUrl: true,
  videoProvider: true,
  videoId: true,
  thumbnailUrl: true,
  publishedAt: true,
  postedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

function shape(row: {
  id: string;
  classSeriesId: string;
  classSessionId: string | null;
  title: string;
  bodyMarkdown: string;
  videoUrl: string | null;
  videoProvider: "youtube" | "vimeo" | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  postedBy: { id: string; firstName: string | null; lastName: string | null };
}): ClassUpdateRow {
  return {
    id: row.id,
    classSeriesId: row.classSeriesId,
    classSessionId: row.classSessionId,
    title: row.title,
    bodyMarkdown: row.bodyMarkdown,
    videoUrl: row.videoUrl,
    videoProvider: row.videoProvider,
    videoId: row.videoId,
    thumbnailUrl: row.thumbnailUrl,
    publishedAt: row.publishedAt,
    postedBy: {
      personId: row.postedBy.id,
      firstName: row.postedBy.firstName,
      lastName: row.postedBy.lastName,
    },
  };
}

export async function listClassUpdatesForSeries(
  classSeriesId: string,
  opts: { limit?: number } = {},
): Promise<ClassUpdateRow[]> {
  const rows = await prisma.classUpdate.findMany({
    where: { classSeriesId, archivedAt: null },
    orderBy: { publishedAt: "desc" },
    take: opts.limit ?? 20,
    select: SELECT,
  });
  return rows.map(shape);
}

/**
 * Latest updates across every series the household is enrolled in.
 * Used by the family-page widget so the parent has one place to see
 * what's been going on with their kids' classes.
 */
export async function listClassUpdatesForHousehold(
  householdId: string,
  opts: { limit?: number } = {},
): Promise<ClassUpdateRow[]> {
  // Walk household → child personIds → enrollments → seriesIds. The
  // sub-query keeps things simple and cache-friendly.
  const childMembers = await prisma.householdMember.findMany({
    where: { householdId, roleInHousehold: "child" },
    select: { personId: true },
  });
  if (childMembers.length === 0) return [];

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentPersonId: { in: childMembers.map((c) => c.personId) },
      status: { in: ["active", "pending_payment"] },
    },
    select: { classSeriesId: true },
    distinct: ["classSeriesId"],
  });
  const seriesIds = enrollments.map((e) => e.classSeriesId);
  if (seriesIds.length === 0) return [];

  const rows = await prisma.classUpdate.findMany({
    where: {
      classSeriesId: { in: seriesIds },
      archivedAt: null,
    },
    orderBy: { publishedAt: "desc" },
    take: opts.limit ?? 10,
    select: SELECT,
  });
  return rows.map(shape);
}

/**
 * Fetch a single class update by id. Returns null when archived or
 * missing. Used by the inbox link resolver.
 */
export async function getClassUpdate(id: string): Promise<ClassUpdateRow | null> {
  const row = await prisma.classUpdate.findFirst({
    where: { id, archivedAt: null },
    select: SELECT,
  });
  return row ? shape(row) : null;
}
