/**
 * DB-side glue for the program-recommendation engine.
 *
 * Keeps `recommend.ts` pure (data-in/data-out) by handling the two
 * Prisma reads here:
 *
 *   1. The viewer + household profile (ages, schools, parentAlsoPlays).
 *   2. The catalog of publicly-listed programs with their "open series"
 *      derived attributes (does any series exist that's published, in
 *      window, and with a school we can match against).
 */

import { prisma } from "@/lib/prisma";
import type { ProgramTargetAudience } from "@prisma/client";
import {
  recommendPrograms,
  type ChildLike,
  type ProgramLike,
  type RecommendOutput,
} from "./recommend";

export interface RecommendationContext {
  viewerAge: number | null;
  children: ChildLike[];
  parentAlsoPlays: boolean;
  /**
   * True when the viewer is 16+ AND their household has at least one
   * `status: "active"` membership. Surfaces adult lessons even for
   * parents who never ticked the "I play too" box at signup.
   */
  viewerIsAdultMember: boolean;
}

const ADULT_MIN_AGE = 16;

export async function getRecommendationContext(
  viewerPersonId: string,
  householdId: string | null,
): Promise<RecommendationContext> {
  const viewer = await prisma.person.findUnique({
    where: { id: viewerPersonId },
    select: { dateOfBirth: true },
  });
  const viewerAge = ageFromDob(viewer?.dateOfBirth ?? null);

  if (!householdId) {
    return {
      viewerAge,
      children: [],
      parentAlsoPlays: false,
      viewerIsAdultMember: false,
    };
  }

  const [household, members, activeMembership] = await Promise.all([
    prisma.household.findUnique({
      where: { id: householdId },
      select: { parentAlsoPlays: true },
    }),
    prisma.householdMember.findMany({
      where: { householdId, roleInHousehold: "child" },
      include: {
        person: {
          select: {
            dateOfBirth: true,
            student: { select: { school: true } },
          },
        },
      },
    }),
    prisma.membership.findFirst({
      where: { householdId, status: "active" },
      select: { id: true },
    }),
  ]);

  const children: ChildLike[] = members.map((m) => ({
    age: ageFromDob(m.person.dateOfBirth),
    schoolSlug: m.person.student?.school?.toLowerCase() ?? null,
  }));

  const viewerIsAdultMember =
    activeMembership != null && (viewerAge ?? 0) >= ADULT_MIN_AGE;

  return {
    viewerAge,
    children,
    parentAlsoPlays: household?.parentAlsoPlays ?? false,
    viewerIsAdultMember,
  };
}

/**
 * Pull every publicly-listed Program plus the bits the recommender
 * needs: its eligible age band (the *envelope* of its published open
 * series + program-level overrides), the school slugs touched by its
 * pickup series, and whether at least one series is currently
 * enrollable.
 */
export async function getCatalogForRecommendation(): Promise<ProgramLike[]> {
  const now = new Date();

  const programs = await prisma.program.findMany({
    where: { isActive: true, isPubliclyListed: true },
    orderBy: { displayOrder: "asc" },
    include: {
      classSeries: {
        where: {
          status: "published",
          visibility: { in: ["public", "members_only"] },
          archivedAt: null,
          endsOn: { gte: now },
        },
        select: {
          minAge: true,
          maxAge: true,
          enrollmentOpensAt: true,
          enrollmentClosesAt: true,
          school: { select: { slug: true } },
        },
      },
    },
  });

  return programs.map((p) => {
    const enrollableNow = p.classSeries.filter((s) => {
      const opens = s.enrollmentOpensAt;
      const closes = s.enrollmentClosesAt;
      if (opens && opens > now) return false;
      if (closes && closes < now) return false;
      return true;
    });

    // Use the *widest* age band across published series; fall back to
    // null when no series declares one. This way "Kids Group Lessons"
    // shows up for any kid in 4–16 even if today's batch only has a
    // 6–8yo class.
    let minAge: number | null = null;
    let maxAge: number | null = null;
    for (const s of p.classSeries) {
      if (s.minAge != null) {
        minAge = minAge == null ? s.minAge : Math.min(minAge, s.minAge);
      }
      if (s.maxAge != null) {
        maxAge = maxAge == null ? s.maxAge : Math.max(maxAge, s.maxAge);
      }
    }

    const schoolMatches = Array.from(
      new Set(
        p.classSeries.flatMap((s) =>
          s.school?.slug ? [s.school.slug.toLowerCase()] : [],
        ),
      ),
    );

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      targetAudience: p.targetAudience as ProgramTargetAudience,
      classTypeKey: p.defaultClassType,
      descriptionPublic: p.descriptionPublic,
      coverImageUrl: p.coverImageUrl,
      schoolMatches,
      minAge,
      maxAge,
      hasOpenSeries: enrollableNow.length > 0,
    };
  });
}

/**
 * One-shot helper used by the portal home page. Combines the household
 * profile + catalog fetch + ranking call into a single async call so the
 * page component stays declarative.
 */
export async function getRecommendationsForViewer(
  viewerPersonId: string,
  householdId: string | null,
): Promise<RecommendOutput & RecommendationContext> {
  const [ctx, programs] = await Promise.all([
    getRecommendationContext(viewerPersonId, householdId),
    getCatalogForRecommendation(),
  ]);
  const out = recommendPrograms({ ...ctx, programs });
  return { ...out, ...ctx };
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
