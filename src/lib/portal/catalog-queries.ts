/**
 * Read-side queries that power the public-facing parent catalog under
 * `/portal/programs/*`. Kept separate from `recommend-queries.ts`
 * because these queries return the full per-series shape (schedule,
 * coaches, slot count) the catalog/detail pages need, whereas the
 * recommender only needs aggregate program flags.
 */

import { prisma } from "@/lib/prisma";
import { venueMapUrl } from "@/lib/maps";
import { resolveCoverImageFocusY } from "@/lib/uploads/cover-image-focus";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import type {
  ClassDeliveryMode,
  ClassSeriesStatus,
  ClassType,
  DayOfWeek,
  Prisma,
  ProgramTargetAudience,
  SkillLevel,
} from "@prisma/client";
import {
  parsePricingTiers,
  type PricingTier,
} from "@/lib/classes/pricing-tiers";
import { formatSkillLevel } from "@/lib/skill-levels";
import {
  parseCampOptions,
  type CampOptionsConfig,
} from "@/lib/classes/camp-options";
import { getNextEventOccurrence } from "@/lib/classes/event-occurrence";

/**
 * Should a parent be able to see this series in `/portal/programs/*`?
 *
 * Anything not published, archived, or out of window stays admin-only.
 * `members_only` series still surface — the portal already requires a
 * logged-in member, which IS the member-only audience.
 *
 * Note: events live in `ClassSeries` rows with `classType=event` and
 * have their own portal surface (`/portal/events`). The catalog must
 * NOT list them as classes, so callers compose this with an
 * additional `classType` filter via `withCatalogClassTypeFilter`.
 */
export const PORTAL_VISIBLE_WHERE = {
  status: "published" as ClassSeriesStatus,
  visibility: { in: ["public" as const, "members_only" as const] },
  archivedAt: null,
};

/**
 * Restricts a `ClassSeriesWhereInput` to either non-event classes
 * (the default catalog) or events. Kept separate from
 * `PORTAL_VISIBLE_WHERE` so the catalog and event surfaces can share
 * the visibility/status rules without bleeding rows across each
 * other's lists.
 */
export const PORTAL_CATALOG_NON_EVENT_WHERE = {
  classType: { not: "event" as const },
};

export const PORTAL_CATALOG_EVENT_WHERE = {
  classType: "event" as const,
};

/** Canonical program slugs whose series use a dedicated classType filter. */
export const PORTAL_CATALOG_CAMP_WHERE = {
  classType: "camp" as const,
};

/** Pick the classType slice for a program list page. */
export function catalogClassTypeWhereForProgramSlug(
  programSlug: string,
): typeof PORTAL_CATALOG_NON_EVENT_WHERE | typeof PORTAL_CATALOG_EVENT_WHERE | typeof PORTAL_CATALOG_CAMP_WHERE {
  if (programSlug === "events") return PORTAL_CATALOG_EVENT_WHERE;
  if (programSlug === "camps") return PORTAL_CATALOG_CAMP_WHERE;
  return PORTAL_CATALOG_NON_EVENT_WHERE;
}

export interface CatalogSeriesCard {
  id: string;
  name: string;
  programSlug: string;
  programName: string;
  programTargetAudience: ProgramTargetAudience;
  seasonName: string | null;
  dayOfWeek: DayOfWeek | null;
  startTimeHHMM: string;
  endTimeHHMM: string;
  startsOn: Date;
  endsOn: Date;
  deliveryMode: ClassDeliveryMode;
  venueName: string;
  venueSlug: string;
  venueAddressLine1: string | null;
  venuePostalCode: string | null;
  venueCity: string | null;
  venueMapUrl: string | null;
  schoolSlug: string | null;
  schoolName: string | null;
  minAge: number | null;
  maxAge: number | null;
  pricePerSeries: number | null;
  memberPrice: number | null;
  nonMemberPrice: number | null;
  levelLabels: string[];
  /** active + pending_payment count (waitlisted not included). */
  enrolledCount: number;
  maxStudents: number;
  /** True when full and waitlist is enabled. */
  isFull: boolean;
  waitlistEnabled: boolean;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date | null;
  /** Computed: can a parent enroll right now (not closed, not future-only)? */
  enrollmentOpenNow: boolean;
  /** Series cover, falling back to program cover when unset. */
  coverImageUrl: string | null;
  /** Vertical crop for `coverImageUrl` (0 = top, 100 = bottom). */
  coverImageFocusY: number;
  /** Club hosting this series, when known (from venue → club or venue slug). */
  venueClubSlug: "triaz" | "randwijck" | null;
  classType: ClassType;
}

// Shared `include` shape so toCard() always sees the same fields.
// Not `as const` — Prisma's generated types want a mutable array for
// the status `in` clause.
const CATALOG_INCLUDE = {
  program: {
    select: {
      name: true,
      slug: true,
      targetAudience: true,
      coverImageUrl: true,
      coverImageFocusY: true,
    },
  },
  season: { select: { name: true } },
  venue: {
    select: {
      name: true,
      slug: true,
      addressLine1: true,
      postalCode: true,
      city: true,
      mapUrl: true,
      club: { select: { slug: true } },
    },
  },
  school: { select: { slug: true, name: true } },
  _count: {
    select: {
      enrollments: {
        where: { status: { in: ["active", "pending_payment"] } },
      },
    },
  },
} satisfies Prisma.ClassSeriesInclude;

/**
 * Drop a series whose enrollment window has fully closed before now.
 * (`endsOn >= now` is already enforced upstream; this catches the
 * "series is in the future but signups closed yesterday" case.)
 */
function isEnrollmentReachable(
  s: { enrollmentClosesAt: Date | null },
  now: Date,
): boolean {
  return s.enrollmentClosesAt == null || s.enrollmentClosesAt >= now;
}

/**
 * List all portal-visible series across the catalog. Used by the
 * "Browse all classes" view when no filters are set.
 */
export async function listAllVisibleSeries(): Promise<CatalogSeriesCard[]> {
  const now = new Date();
  const rows = await prisma.classSeries.findMany({
    where: {
      ...PORTAL_VISIBLE_WHERE,
      ...PORTAL_CATALOG_NON_EVENT_WHERE,
      endsOn: { gte: now },
    },
    include: CATALOG_INCLUDE,
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });

  return rows.filter((s) => isEnrollmentReachable(s, now)).map((s) => toCard(s, now));
}

/**
 * Portal-visible events. Same shape as classes — events are
 * `ClassSeries` rows with `classType=event` — but kept on their own
 * surface so the program catalog stays focused on recurring classes.
 */
export async function listVisibleEvents(): Promise<CatalogSeriesCard[]> {
  const now = new Date();
  const rows = await prisma.classSeries.findMany({
    where: {
      ...PORTAL_VISIBLE_WHERE,
      ...PORTAL_CATALOG_EVENT_WHERE,
      endsOn: { gte: now },
    },
    include: {
      ...CATALOG_INCLUDE,
      sessions: {
        where: { status: { not: "cancelled" } },
        select: { startsAt: true },
        orderBy: { startsAt: "asc" },
      },
    },
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });

  const filtered = rows.filter((s) => isEnrollmentReachable(s, now));
  const cards = await Promise.all(
    filtered.map(async (s) => {
      const card = toCard(s, now);
      const next = getNextEventOccurrence(s.sessions, now);
      if (!next) return card;
      const occurrenceEnrolled = await prisma.enrollment.count({
        where: {
          classSeriesId: s.id,
          status: { in: ["active", "pending_payment"] },
          eventOccurrenceDate: next.occurrenceDate,
        },
      });
      return {
        ...card,
        enrolledCount: occurrenceEnrolled,
        isFull: occurrenceEnrolled >= s.maxStudents,
      };
    }),
  );
  return cards;
}

/**
 * List visible series for one program slug. Used by the program
 * detail / series-list page.
 */
export async function listVisibleSeriesForProgram(
  programSlug: string,
): Promise<CatalogSeriesCard[]> {
  const now = new Date();
  const rows = await prisma.classSeries.findMany({
    where: {
      ...PORTAL_VISIBLE_WHERE,
      ...catalogClassTypeWhereForProgramSlug(programSlug),
      endsOn: { gte: now },
      program: { slug: programSlug, isActive: true, isPubliclyListed: true },
    },
    include: CATALOG_INCLUDE,
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });
  return rows.filter((s) => isEnrollmentReachable(s, now)).map((s) => toCard(s, now));
}

// ----------------------------------------------------------------------
// listVisibleSeriesWithFilters — powers the new BrowseAll component.
// ----------------------------------------------------------------------

export type AudienceFilter = "youth" | "adults" | "all";

export interface CatalogFilterInput {
  audience?: AudienceFilter;
  delivery?: ClassDeliveryMode;
  day?: DayOfWeek;
  /** Lowercase venue slug ("triaz" | "randwijck"). */
  venue?: string;
  /** Lowercase school slug ("bsa" | "ifs" | …); "" or undefined = any. */
  school?: string;
  /** Integer age in years; only series whose [minAge,maxAge] window includes it survive. */
  age?: number;
  /** Free-text search against series name + program name. */
  q?: string;
}

/**
 * Single source of truth for the BrowseAll list. Pushes as much
 * filtering as possible into Postgres so the row-set stays small.
 *
 * Audience handling:
 *   - "youth"  → Programs whose targetAudience is `kids` OR `mixed`.
 *   - "adults" → Programs whose targetAudience is `adults` OR `mixed`.
 *   - "all"    → No audience filter.
 *
 * Past series (`endsOn < now`) and series whose enrollment window has
 * fully closed (`enrollmentClosesAt < now`) are always hidden — we
 * never want to show something a parent can't actually book.
 */
export async function listVisibleSeriesWithFilters(
  input: CatalogFilterInput = {},
): Promise<CatalogSeriesCard[]> {
  const now = new Date();
  const where: Prisma.ClassSeriesWhereInput = {
    ...PORTAL_VISIBLE_WHERE,
    ...PORTAL_CATALOG_NON_EVENT_WHERE,
    endsOn: { gte: now },
  };

  if (input.audience === "youth") {
    where.program = {
      isActive: true,
      isPubliclyListed: true,
      targetAudience: { in: ["kids", "mixed"] },
    };
  } else if (input.audience === "adults") {
    where.program = {
      isActive: true,
      isPubliclyListed: true,
      targetAudience: { in: ["adults", "mixed"] },
    };
  } else {
    where.program = { isActive: true, isPubliclyListed: true };
  }

  if (input.delivery) where.deliveryMode = input.delivery;
  if (input.day) where.dayOfWeek = input.day;
  if (input.venue) {
    where.venue = { slug: input.venue };
  }
  if (input.school) {
    where.school = { slug: input.school };
  }
  if (input.age != null && Number.isFinite(input.age)) {
    const a = Math.floor(input.age);
    // Series matches if its [minAge,maxAge] window includes `a`,
    // treating null bounds as open-ended.
    where.AND = [
      { OR: [{ minAge: null }, { minAge: { lte: a } }] },
      { OR: [{ maxAge: null }, { maxAge: { gte: a } }] },
    ];
  }
  if (input.q && input.q.trim().length > 0) {
    const q = input.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { program: { ...(where.program as Prisma.ProgramWhereInput), name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.classSeries.findMany({
    where,
    include: CATALOG_INCLUDE,
    orderBy: [{ startsOn: "asc" }, { name: "asc" }],
  });

  return rows.filter((s) => isEnrollmentReachable(s, now)).map((s) => toCard(s, now));
}

// ----------------------------------------------------------------------
// listPickupSchoolsWithSeries — powers Step 3 of the Browse wizard.
// ----------------------------------------------------------------------

export interface PickupSchoolOption {
  slug: string;
  name: string;
  seriesCount: number;
}

/**
 * Return the partner schools that currently have at least one
 * portal-visible, pickup-mode series with a still-open enrollment
 * window. Ordered by `seriesCount` desc so the most-active schools
 * come first.
 *
 * Used by Browse-classes Step 3 (Youth → School pickup → pick a
 * school). Schools with zero open series are intentionally omitted
 * rather than shown as locked tiles, because the user already opted
 * into the pickup path and a locked school would just be noise.
 */
export async function listPickupSchoolsWithSeries(): Promise<
  PickupSchoolOption[]
> {
  const now = new Date();
  const rows = await prisma.classSeries.findMany({
    where: {
      ...PORTAL_VISIBLE_WHERE,
      endsOn: { gte: now },
      deliveryMode: "pickup",
      schoolId: { not: null },
    },
    select: {
      enrollmentClosesAt: true,
      school: { select: { slug: true, name: true } },
    },
  });

  const counts = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!r.school) continue;
    if (!isEnrollmentReachable(r, now)) continue;
    const key = r.school.slug.toLowerCase();
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { name: r.school.name, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .map(([slug, v]) => ({ slug, name: v.name, seriesCount: v.count }))
    .sort(
      (a, b) =>
        b.seriesCount - a.seriesCount || a.name.localeCompare(b.name),
    );
}

export interface CatalogSeriesDetail extends CatalogSeriesCard {
  classType: ClassType;
  pricingTiers: PricingTier[] | null;
  campOptions: CampOptionsConfig | null;
  publicNotes: string | null;
  programDescription: string | null;
  coverImageUrl: string | null;
  coverImageFocusY: number;
  pickupAtHHMM: string | null;
  coachNames: string[];
  coaches: Array<{ name: string; photoUrl: string | null }>;
  /**
   * Optional WhatsApp group invite link. Only surfaced to *enrolled*
   * members in the page UI — non-members shouldn't see it. Stored on
   * the series so coaches and the office can keep one canonical link
   * per group chat.
   */
  whatsappUrl: string | null;
  /** Upcoming + scheduled sessions for this series, in order. */
  sessions: { id: string; startsAt: Date; endsAt: Date }[];
  /** Next sellable occurrence for event series. */
  nextEventOccurrence: {
    occurrenceDate: Date;
    startsAt: Date;
  } | null;
  waitlistedCount: number;
  /**
   * The slug of the club hosting this series, when it can be inferred
   * from the venue. Used by the enrollment checkout to decide which
   * single-club membership to quote as an add-on for non-members.
   * Null for "onsite" / partner-venue series with no club association.
   */
  venueClubSlug: "triaz" | "randwijck" | null;
  /**
   * Sub-groups inside the series (split-class scaffolding). Every
   * series has at least one — single-band classes get one auto-named
   * row mirroring the series window. Multi-row series surface a
   * group picker on the enroll panel.
   */
  groups: Array<{
    id: string;
    name: string;
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels: string[];
    /** HH:MM in Europe/Amsterdam — the band's own end time. */
    endTimeHHMM: string;
    maxStudents: number;
    enrolledCount: number;
  }>;
}

/**
 * Full detail for a single series — used by the `[seriesId]` page.
 * Returns null when the series is archived or not portal-visible.
 */
export async function getVisibleSeriesById(
  seriesId: string,
): Promise<CatalogSeriesDetail | null> {
  const now = new Date();
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
  const fallbackCoachLabel = `${brand.shortName} ${terms.coach.singular.toLowerCase()}`;
  const s = await prisma.classSeries.findFirst({
    where: {
      id: seriesId,
      ...PORTAL_VISIBLE_WHERE,
    },
    include: {
      program: {
        select: {
          name: true,
          slug: true,
          targetAudience: true,
          descriptionPublic: true,
          coverImageUrl: true,
          coverImageFocusY: true,
        },
      },
      season: { select: { name: true } },
      venue: {
        select: {
          name: true,
          slug: true,
          addressLine1: true,
          postalCode: true,
          city: true,
          mapUrl: true,
          club: { select: { slug: true } },
        },
      },
      school: { select: { slug: true, name: true } },
      coaches: {
        include: {
          coach: {
            select: {
              photoUrl: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      sessions: {
        where: {
          status: { not: "cancelled" },
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, startsAt: true, endsAt: true },
      },
      groups: {
        where: { archivedAt: null },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
          endTime: true,
          maxStudents: true,
          _count: {
            select: {
              enrollments: {
                where: { status: { in: ["active", "pending_payment"] } },
              },
            },
          },
        },
      },
      _count: {
        select: {
          enrollments: {
            where: { status: { in: ["active", "pending_payment"] } },
          },
        },
      },
    },
  });

  if (!s) return null;

  const nextEventOccurrence =
    s.classType === "event"
      ? getNextEventOccurrence(s.sessions, now)
      : null;

  const waitlisted = await prisma.enrollment.count({
    where: {
      classSeriesId: s.id,
      status: "waitlist",
      ...(nextEventOccurrence
        ? { eventOccurrenceDate: nextEventOccurrence.occurrenceDate }
        : {}),
    },
  });

  let card = toCard(s, now);

  if (nextEventOccurrence) {
    const occurrenceEnrolled = await prisma.enrollment.count({
      where: {
        classSeriesId: s.id,
        status: { in: ["active", "pending_payment"] },
        eventOccurrenceDate: nextEventOccurrence.occurrenceDate,
      },
    });
    card = {
      ...card,
      enrolledCount: occurrenceEnrolled,
      isFull: occurrenceEnrolled >= s.maxStudents,
    };
  }

  const coachEntries = s.coaches.map((c) => {
    const name =
      [c.coach.person.firstName, c.coach.person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || fallbackCoachLabel;
    return { name, photoUrl: c.coach.photoUrl };
  });
  const coachNames = coachEntries.map((c) => c.name);

  const venueClubSlug = resolveVenueClubSlug(s.venue);

  return {
    ...card,
    classType: s.classType,
    pricingTiers: parsePricingTiers(s.pricingTiers),
    campOptions: parseCampOptions(s.campOptions),
    publicNotes: s.publicNotes,
    programDescription: s.program.descriptionPublic,
    coverImageUrl: s.coverImageUrl ?? s.program.coverImageUrl,
    coverImageFocusY: resolveCoverImageFocusY({
      seriesCoverUrl: s.coverImageUrl,
      seriesFocusY: s.coverImageFocusY,
      programFocusY: s.program.coverImageFocusY,
    }),
    pickupAtHHMM: s.pickupAt ? timeToHHMM(s.pickupAt) : null,
    coachNames,
    coaches: coachEntries,
    whatsappUrl: s.whatsappUrl,
    sessions: s.sessions,
    nextEventOccurrence,
    waitlistedCount: waitlisted,
    venueClubSlug,
    groups: s.groups.map((g) => ({
      id: g.id,
      name: g.name,
      minAge: g.minAge,
      maxAge: g.maxAge,
      eligibleSkillLevels: g.eligibleSkillLevels,
      endTimeHHMM: timeToHHMM(g.endTime),
      maxStudents: g.maxStudents,
      enrolledCount: g._count.enrollments,
    })),
  };
}

// ----------------------------------------------------------------------
// Cheapest-by-bucket — powers the AudiencePromoStrip "From €X" labels.
// ----------------------------------------------------------------------

export type AudienceBucket = "youth" | "adults" | "pickup";

/**
 * Cheapest *currently visible* series price per audience bucket. The
 * landing page uses these to advertise "From €X / season" on the three
 * promo tiles.
 *
 * Buckets:
 *   - youth   → kids/mixed programs across all delivery modes.
 *   - adults  → adults/mixed programs.
 *   - pickup  → kids/mixed programs in `pickup` delivery mode (a
 *               subset of `youth` but called out for the promo tile).
 *
 * A bucket without any priced visible series resolves to `null` so the
 * caller can hide the "From" label rather than show a misleading €0.
 */
export async function getCheapestSeriesPriceByBucket(): Promise<
  Record<AudienceBucket, number | null>
> {
  const now = new Date();
  const rows = await prisma.classSeries.findMany({
    where: {
      ...PORTAL_VISIBLE_WHERE,
      ...PORTAL_CATALOG_NON_EVENT_WHERE,
      endsOn: { gte: now },
      pricePerSeries: { not: null },
      program: { isActive: true, isPubliclyListed: true },
    },
    select: {
      pricePerSeries: true,
      deliveryMode: true,
      enrollmentClosesAt: true,
      program: { select: { targetAudience: true } },
    },
  });

  let youth: number | null = null;
  let adults: number | null = null;
  let pickup: number | null = null;

  for (const r of rows) {
    if (!isEnrollmentReachable(r, now)) continue;
    if (r.pricePerSeries == null) continue;
    const price = Number(r.pricePerSeries);
    const audience = r.program.targetAudience;
    if (audience === "kids" || audience === "mixed") {
      if (youth == null || price < youth) youth = price;
      if (
        r.deliveryMode === "pickup" &&
        (pickup == null || price < pickup)
      ) {
        pickup = price;
      }
    }
    if (audience === "adults" || audience === "mixed") {
      if (adults == null || price < adults) adults = price;
    }
  }

  return { youth, adults, pickup };
}

// Coverage queries for enrollment / booking / ladder live in
// `src/lib/memberships/coverage.ts` — `getActiveMembershipCoverage()`.
// Catalog stays focused on series-shaped reads.

export async function getProgramBySlug(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      descriptionPublic: true,
      coverImageUrl: true,
      coverImageFocusY: true,
      targetAudience: true,
      isActive: true,
      isPubliclyListed: true,
    },
  });
}

// ----------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------

type SeriesWithCount = Awaited<ReturnType<typeof listAllVisibleSeries>>;

function toCard(
  s: {
    id: string;
    name: string;
    coverImageUrl?: string | null;
    coverImageFocusY?: number;
    program: {
      name: string;
      slug: string;
      targetAudience: ProgramTargetAudience;
      coverImageUrl?: string | null;
      coverImageFocusY?: number;
    };
    season: { name: string } | null;
    venue: {
      name: string;
      slug: string;
      addressLine1: string | null;
      postalCode: string | null;
      city: string | null;
      mapUrl: string | null;
      club?: { slug: string } | null;
    };
    school: { slug: string; name: string } | null;
    dayOfWeek: DayOfWeek | null;
    startTime: Date;
    endTime: Date;
    startsOn: Date;
    endsOn: Date;
    deliveryMode: ClassDeliveryMode;
    classType: ClassType;
    minAge: number | null;
    maxAge: number | null;
    pricePerSeries: { toNumber: () => number } | null;
    pricingTiers: unknown;
    eligibleSkillLevels: SkillLevel[];
    maxStudents: number;
    waitlistEnabled: boolean;
    enrollmentOpensAt: Date | null;
    enrollmentClosesAt: Date | null;
    _count: { enrollments: number };
  },
  now: Date,
): CatalogSeriesCard {
  const opens = s.enrollmentOpensAt;
  const closes = s.enrollmentClosesAt;
  const enrollmentOpenNow =
    (opens == null || opens <= now) && (closes == null || closes >= now);

  const enrolled = s._count.enrollments;
  const isFull = enrolled >= s.maxStudents;

  const tiers = parsePricingTiers(s.pricingTiers);
  const isEvent = s.classType === "event";
  const memberTier = !isEvent ? tiers?.find((t) => t.forMembers) : null;
  const nonMemberPrice = s.pricePerSeries ? Number(s.pricePerSeries) : null;
  const memberPrice = memberTier?.amountEur ?? null;
  const levelLabels = s.eligibleSkillLevels.map((level) =>
    formatSkillLevel(level),
  );

  return {
    id: s.id,
    name: s.name,
    programSlug: s.program.slug,
    programName: s.program.name,
    programTargetAudience: s.program.targetAudience,
    seasonName: s.season?.name ?? null,
    dayOfWeek: s.dayOfWeek,
    startTimeHHMM: timeToHHMM(s.startTime),
    endTimeHHMM: timeToHHMM(s.endTime),
    startsOn: s.startsOn,
    endsOn: s.endsOn,
    deliveryMode: s.deliveryMode,
    venueName: s.venue.name,
    venueSlug: s.venue.slug.toLowerCase(),
    venueAddressLine1: s.venue.addressLine1,
    venuePostalCode: s.venue.postalCode,
    venueCity: s.venue.city,
    venueMapUrl: venueMapUrl(s.venue),
    schoolSlug: s.school?.slug.toLowerCase() ?? null,
    schoolName: s.school?.name ?? null,
    minAge: s.minAge,
    maxAge: s.maxAge,
    pricePerSeries: nonMemberPrice,
    memberPrice,
    nonMemberPrice,
    levelLabels,
    enrolledCount: enrolled,
    maxStudents: s.maxStudents,
    isFull,
    waitlistEnabled: s.waitlistEnabled,
    enrollmentOpensAt: opens,
    enrollmentClosesAt: closes,
    enrollmentOpenNow,
    coverImageUrl: s.coverImageUrl ?? s.program.coverImageUrl ?? null,
    coverImageFocusY: resolveCoverImageFocusY({
      seriesCoverUrl: s.coverImageUrl,
      seriesFocusY: s.coverImageFocusY,
      programFocusY: s.program.coverImageFocusY,
    }),
    venueClubSlug: resolveVenueClubSlug(s.venue),
    classType: s.classType,
  };
}

function resolveVenueClubSlug(venue: {
  slug: string;
  club?: { slug: string } | null;
}): "triaz" | "randwijck" | null {
  const raw = venue.club?.slug.toLowerCase() ?? venue.slug.toLowerCase();
  if (raw === "triaz") return "triaz";
  if (raw === "randwijck") return "randwijck";
  return null;
}

function timeToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type _CatalogReturnType = SeriesWithCount;
