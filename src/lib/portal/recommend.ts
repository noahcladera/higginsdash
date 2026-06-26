/**
 * Program recommendation engine for the member portal home page.
 *
 * Pure data-in/data-out: takes the household shape (the logged-in
 * adult's age, each child's age + school) plus the catalog of
 * `Program`s and emits a ranked list. Lives outside `prisma` so it can
 * be exercised with fixture data and unit-tested without spinning up a
 * database.
 *
 * Design rules (per gotimmy-substitute v1 plan):
 *
 *  1. Recommend on **age + school only** — skill is too much friction
 *     to ask up front.
 *  2. **Kids first** when the viewer is a parent; **adults first** when
 *     the viewer is adult-only OR the parent ticked "I play too" but
 *     has no kids in age range.
 *  3. **School-pickup programs only show up if a child's school
 *     matches** one of the program's published series — otherwise the
 *     parent of an OBS de Kweekvijver kid would see "BSA pickup" and
 *     get confused.
 *  4. **Privates last**, always, because they need an off-portal
 *     conversation to organize.
 *
 * See `__tests__/recommend.test.ts` for the fixture matrix.
 */

import type { ProgramTargetAudience } from "@prisma/client";

/** A Program from the catalog as seen by this engine. */
export interface ProgramLike {
  id: string;
  slug: string;
  name: string;
  targetAudience: ProgramTargetAudience;
  /** Slug-or-keyword token used to special-case privates / school-pickup. */
  classTypeKey: string;
  /** Optional description so the home page can show a one-liner. */
  descriptionPublic: string | null;
  coverImageUrl: string | null;
  coverImageFocusY: number;
  /**
   * Schools (slugs / labels) this program serves. Empty array = open to
   * any school. Matters for school-pickup programs only — a kids-group
   * program won't have any.
   */
  schoolMatches: string[];
  /** Min age in years (inclusive). null = no lower bound. */
  minAge: number | null;
  /** Max age in years (inclusive). null = no upper bound. */
  maxAge: number | null;
  /** Whether the program has at least one published, in-window series. */
  hasOpenSeries: boolean;
}

export interface ChildLike {
  /** Age in whole years; null when DOB unknown (treat as eligible-for-anything). */
  age: number | null;
  /** Lowercase school slug ("bsa", "ifs", "aics", "amity", "kindercampus", custom, …). */
  schoolSlug: string | null;
}

export interface RecommendInput {
  /** Logged-in viewer's age (null when DOB unknown). */
  viewerAge: number | null;
  children: ChildLike[];
  /** Set when the parent ticked the "I play too" box on signup. */
  parentAlsoPlays: boolean;
  /**
   * True when the viewer is 16+ AND their household holds at least one
   * currently active membership. Treated as an implicit "I play too"
   * signal — paying members are obviously playing.
   */
  viewerIsAdultMember: boolean;
  /** All publicly-listed programs. */
  programs: ProgramLike[];
}

export interface ProgramRec {
  program: ProgramLike;
  /**
   * Why this surfaced. One sentence the home page can show below the title:
   * "Perfect for Mia (5)", "BSA pickup matches Olive's school", etc.
   */
  reason: string;
  /** "kids" when matched on a child, "adults" when matched on the viewer, "mixed" otherwise. */
  bucket: "kids" | "adults" | "mixed";
  /** Higher = more strongly recommended. */
  score: number;
}

export interface RecommendOutput {
  /** Top recommendations the welcome strip leads with. */
  hero: ProgramRec[];
  /** Anything else worth showing in a "More to explore" row. */
  more: ProgramRec[];
  /** The full ranked list — useful for the catalog page's default order. */
  all: ProgramRec[];
}

const DEFAULT_KIDS_MIN_AGE = 4;
const DEFAULT_KIDS_MAX_AGE = 17;
const DEFAULT_ADULT_MIN_AGE = 16;

/**
 * Rank programs for a given household.
 *
 * The function never throws and never returns an empty `all` even when
 * inputs are sparse — it just returns fewer (or zero) hero/more items.
 * Programs without an open series are filtered out unconditionally so
 * the welcome page never recommends something a parent can't enroll in.
 */
export function recommendPrograms(input: RecommendInput): RecommendOutput {
  const isParent = input.children.length > 0;
  const viewerAge = input.viewerAge;
  const adultPlays =
    !isParent ||
    input.parentAlsoPlays ||
    input.viewerIsAdultMember ||
    (viewerAge != null && viewerAge >= DEFAULT_ADULT_MIN_AGE && !isParent);

  const recs: ProgramRec[] = [];

  for (const program of input.programs) {
    if (!program.hasOpenSeries) continue;

    const matches = matchProgram(program, input, adultPlays);
    if (matches.length === 0) continue;

    // Pick the strongest match per program; the rest go into the
    // human-readable "reason" so the card can say "Mia (5) and Theo
    // (8)" for a kids-group program.
    const best = matches[0];
    const reason = composeReason(program, matches, isParent);

    recs.push({
      program,
      bucket: best.bucket,
      reason,
      score: best.score,
    });
  }

  recs.sort((a, b) => {
    // Bucket priority depends on whether the viewer is a parent.
    const aBucket = bucketRank(a.bucket, isParent);
    const bBucket = bucketRank(b.bucket, isParent);
    if (aBucket !== bBucket) return aBucket - bBucket;
    // Higher score wins inside the same bucket.
    return b.score - a.score;
  });

  return {
    hero: recs.slice(0, 3),
    more: recs.slice(3, 6),
    all: recs,
  };
}

// ----------------------------------------------------------------------
// internals
// ----------------------------------------------------------------------

interface Match {
  bucket: "kids" | "adults" | "mixed";
  /** Higher = stronger signal. */
  score: number;
  /** Used for the "Perfect for X (5)" copy. */
  childName?: string;
  childAge?: number;
  isSchoolMatch?: boolean;
}

function matchProgram(
  program: ProgramLike,
  input: RecommendInput,
  adultPlays: boolean,
): Match[] {
  const matches: Match[] = [];

  const audience = program.targetAudience;
  const isPrivates = isPrivateLessonProgram(program);
  const isSchoolPickup = isSchoolPickupProgram(program);

  // Kids matches — one per eligible child so we can compose "Mia & Theo".
  if (audience === "kids" || audience === "mixed") {
    for (const child of input.children) {
      if (!ageInBand(child.age, program, "kids")) continue;
      if (isSchoolPickup) {
        // Pickup programs need a school match; otherwise we'd surface a
        // BSA-only class to an OBS-de-Kweekvijver parent.
        if (program.schoolMatches.length > 0) {
          if (!child.schoolSlug) continue;
          const childSlug = child.schoolSlug.toLowerCase();
          const matchesAny = program.schoolMatches.some(
            (s) => s.toLowerCase() === childSlug,
          );
          if (!matchesAny) continue;
        }
        matches.push({
          bucket: "kids",
          score: 100, // school match outranks generic kids match
          childAge: child.age ?? undefined,
          isSchoolMatch: true,
        });
      } else {
        matches.push({
          bucket: "kids",
          score: 70,
          childAge: child.age ?? undefined,
        });
      }
    }
  }

  // Adult match — single one for the viewer.
  if ((audience === "adults" || audience === "mixed") && adultPlays) {
    const okAge =
      input.viewerAge == null ||
      input.viewerAge >= (program.minAge ?? DEFAULT_ADULT_MIN_AGE);
    if (okAge) {
      matches.push({
        bucket: "adults",
        // Strong signal when adult-only & explicit toggle is on; weaker
        // for "mixed" because we can't tell if the parent really means it.
        score: audience === "adults" ? 60 : 40,
      });
    }
  }

  // Privates always last — bury even when matched.
  if (isPrivates) {
    for (const m of matches) m.score = Math.min(m.score, 20);
  }

  // Sort matches strongest-first so `best = matches[0]`.
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

function ageInBand(
  age: number | null,
  program: ProgramLike,
  audience: "kids" | "adults",
): boolean {
  // Unknown age -> assume eligible. Parents adding kids without DOB still
  // want to see what's on offer; the catalog page filters more strictly.
  if (age == null) return true;
  const min =
    program.minAge ??
    (audience === "kids" ? DEFAULT_KIDS_MIN_AGE : DEFAULT_ADULT_MIN_AGE);
  const max =
    program.maxAge ?? (audience === "kids" ? DEFAULT_KIDS_MAX_AGE : 120);
  return age >= min && age <= max;
}

function bucketRank(
  bucket: "kids" | "adults" | "mixed",
  isParent: boolean,
): number {
  if (isParent) {
    if (bucket === "kids") return 0;
    if (bucket === "mixed") return 1;
    return 2; // adults last for parents
  }
  if (bucket === "adults") return 0;
  if (bucket === "mixed") return 1;
  return 2;
}

function composeReason(
  program: ProgramLike,
  matches: Match[],
  isParent: boolean,
): string {
  const top = matches[0];

  if (top.bucket === "adults") {
    if (program.targetAudience === "adults") return "For you.";
    return "Open to adults too.";
  }

  if (top.bucket === "kids") {
    const ages = matches
      .filter((m) => m.bucket === "kids" && m.childAge != null)
      .map((m) => m.childAge as number);
    const ageList =
      ages.length === 0
        ? "your child"
        : ages.length === 1
          ? `your ${ages[0]}-year-old`
          : `your ${ages.slice(0, -1).join(", ")} and ${ages[ages.length - 1]}-year-olds`;
    if (top.isSchoolMatch) {
      return `Pickup at ${ageList === "your child" ? "school" : "school"} for ${ageList}.`;
    }
    return `Built for ${ageList}.`;
  }

  return isParent ? "Open to your family." : "Worth a look.";
}

function isPrivateLessonProgram(p: ProgramLike): boolean {
  return /priv/i.test(p.slug) || /priv/i.test(p.classTypeKey);
}

function isSchoolPickupProgram(p: ProgramLike): boolean {
  return /school/i.test(p.slug) || /school_pickup/.test(p.classTypeKey);
}
