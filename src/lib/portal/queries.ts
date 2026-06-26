import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  eventSessionDedupeKey,
  sessionMatchesEnrollmentScope,
  sessionWindowsForEnrollments,
} from "@/lib/classes/event-occurrence";
import type { HouseholdOwnership, MembershipTier } from "@/lib/pricing";
import { listConfiguredClubSlugs } from "@/lib/pricing/config";
import { resolveVenueClubSlug } from "@/lib/club-theme";

/**
 * Runtime list of club slugs the active org sells memberships for.
 * Sourced from the pricing config so renaming / adding a club only
 * requires an edit there — not at every coverage query call site.
 * The `("triaz" | "randwijck")[]` compile-time union stays; what
 * changes is where the iteration order / membership set come from.
 */
const CONFIGURED_CLUB_SLUGS = listConfiguredClubSlugs();

/**
 * Shared portal-facing data fetchers. Each one is a small, focused query
 * used by one or more portal pages. Keeping them here means we only have
 * one place to tune them when, e.g., we change how "active membership"
 * is computed.
 */

export interface UpcomingBooking {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  purpose: string;
  clubName: string;
  courtName: string;
}

export async function getUpcomingBookingsForPerson(
  personId: string,
  limit = 5,
): Promise<UpcomingBooking[]> {
  const rows = await prisma.courtBooking.findMany({
    where: {
      bookedByPersonId: personId,
      startsAt: { gte: new Date() },
      status: { in: ["confirmed", "cancellation_requested"] },
    },
    orderBy: { startsAt: "asc" },
    take: limit,
    include: { club: true, court: true },
  });
  return rows.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    status: b.status,
    purpose: b.purpose,
    clubName: b.club.name,
    courtName: b.court.name,
  }));
}

export interface UpcomingSession {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  studentPersonId: string;
  studentFirstName: string;
  seriesName: string;
  programName: string;
  courtName: string | null;
  clubName: string | null;
  venueText: string | null;
  /** How the class is delivered — drives pickup/onsite badging. */
  deliveryMode: "at_club" | "onsite" | "pickup";
  /** Where the class is played (Triaz / Randwijck / AICS). */
  venueName: string;
  /** Resolved club slug for venue-aware badges. */
  venueClubSlug: "triaz" | "randwijck" | null;
  /** Pickup-mode only: kids-out-of-school time, anchored to session day. */
  pickupAt: Date | null;
  /** Pickup-mode only: pickup school name (IFS / AICS / BSA / AMITY). */
  schoolName: string | null;
  /** Pickup-mode only: minutes before `pickupAt` coach must be at Triaz hub. */
  schoolCoachArriveAtHubMinutes: number | null;
  /**
   * True when the student already marked this upcoming session as
   * `excused` via the portal "I can't make this one" button.
   * Drives the "Skipping" badge in the portal classes list.
   */
  isPlannedAbsence: boolean;
}

/**
 * Upcoming class sessions for one or more students. Regular series return
 * every future session; events return only the enrolled occurrence date.
 * Cancelled sessions are filtered out.
 */
export async function getUpcomingSessionsForStudents(
  studentPersonIds: string[],
  limit = 8,
): Promise<UpcomingSession[]> {
  if (studentPersonIds.length === 0) return [];

  const now = new Date();
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentPersonId: { in: studentPersonIds },
      status: { in: ["active", "pending_payment"] },
    },
    include: {
      classSeries: {
        select: {
          id: true,
          name: true,
          classType: true,
          program: { select: { name: true } },
        },
      },
      student: {
        select: {
          person: { select: { firstName: true } },
        },
      },
    },
  });
  if (enrollments.length === 0) return [];

  const enrollmentScopes = enrollments.map((e) => ({
    classSeriesId: e.classSeriesId,
    classType: e.classSeries.classType,
    eventOccurrenceDate: e.eventOccurrenceDate,
  }));
  const sessionWindows = sessionWindowsForEnrollments(enrollmentScopes, now);
  if (sessionWindows.length === 0) return [];

  const sessionWhere: Prisma.ClassSessionWhereInput = {
    OR: sessionWindows.map((w) => ({
      classSeriesId: w.classSeriesId,
      startsAt: {
        gte: w.startsAtGte,
        ...(w.startsAtLt ? { lt: w.startsAtLt } : {}),
      },
      status: { not: "cancelled" },
    })),
  };

  const sessions = await prisma.classSession.findMany({
    where: sessionWhere,
    orderBy: { startsAt: "asc" },
    take: limit * studentPersonIds.length, // a single student can have many series
    include: {
      court: { include: { club: true } },
      classSeries: {
        select: {
          id: true,
          name: true,
          deliveryMode: true,
          pickupAt: true,
          program: { select: { name: true } },
          venue: {
            select: {
              name: true,
              slug: true,
              club: { select: { slug: true } },
            },
          },
          school: {
            select: {
              name: true,
              coachArriveAtHubMinutes: true,
            },
          },
        },
      },
    },
  });

  // Look up planned-absence rows in one query so we can flag which (session,
  // student) combos already have an excused attendance row written.
  const sessionIds = sessions.map((s) => s.id);
  const excused =
    sessionIds.length === 0
      ? []
      : await prisma.attendance.findMany({
          where: {
            classSessionId: { in: sessionIds },
            studentPersonId: { in: studentPersonIds },
            status: "excused",
          },
          select: { classSessionId: true, studentPersonId: true },
        });
  const excusedKey = new Set(
    excused.map((a) => `${a.classSessionId}::${a.studentPersonId}`),
  );

  // Cross every session with every enrolled student in that series so a
  // single session shows up once per attending kid (e.g. siblings in same
  // class). Events further scope to one occurrence and dedupe multi-court
  // rows on the same date.
  const out: UpcomingSession[] = [];
  const seenEventSessionKeys = new Set<string>();
  const legacyEventEarliest = new Map<string, Date>();

  for (const s of sessions) {
    const enrolledHere = enrollments.filter((e) => {
      if (e.classSeriesId !== s.classSeriesId) return false;
      return sessionMatchesEnrollmentScope(s.startsAt, {
        classSeriesId: e.classSeriesId,
        classType: e.classSeries.classType,
        eventOccurrenceDate: e.eventOccurrenceDate,
      });
    });
    for (const e of enrolledHere) {
      if (e.classSeries.classType === "event") {
        if (e.eventOccurrenceDate == null) {
          const legacyKey = `${e.studentPersonId}::${e.classSeriesId}`;
          const earliest = legacyEventEarliest.get(legacyKey);
          if (earliest == null || s.startsAt.getTime() < earliest.getTime()) {
            legacyEventEarliest.set(legacyKey, s.startsAt);
          } else {
            continue;
          }
        }

        const dedupeKey = eventSessionDedupeKey(
          e.studentPersonId,
          e.classSeriesId,
          s.startsAt,
        );
        if (seenEventSessionKeys.has(dedupeKey)) continue;
        seenEventSessionKeys.add(dedupeKey);
      }

      out.push({
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        studentPersonId: e.studentPersonId,
        studentFirstName: e.student.person.firstName || "Student",
        seriesName: s.classSeries.name,
        programName: s.classSeries.program.name,
        courtName: s.court?.name ?? null,
        clubName: s.court?.club.name ?? null,
        venueText: s.venueText ?? null,
        deliveryMode: s.classSeries.deliveryMode,
        venueName: s.classSeries.venue.name,
        venueClubSlug: resolveVenueClubSlug(s.classSeries.venue),
        pickupAt: s.classSeries.pickupAt,
        schoolName: s.classSeries.school?.name ?? null,
        schoolCoachArriveAtHubMinutes:
          s.classSeries.school?.coachArriveAtHubMinutes ?? null,
        isPlannedAbsence: excusedKey.has(`${s.id}::${e.studentPersonId}`),
      });
    }
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out.slice(0, limit);
}

export interface MembershipDetail {
  id: string;
  /**
   * Derived from `coverageTier`: `family` ↔ family, `adult|child` ↔
   * individual. Kept on the DTO purely as a UI convenience — the DB
   * no longer stores a separate `kind` column (dropped 2026-04-21).
   */
  kind: "individual" | "family";
  /** adult | child | family. Drives pricing and per-row labelling. */
  coverageTier: "adult" | "child" | "family";
  status: string;
  startsOn: Date;
  expiresOn: Date;
  /** Days until expiry; negative if already expired. */
  daysUntilExpiry: number;
  /** EUR paid for this row, or null for legacy/seed memberships with no record. */
  pricePaid: number | null;
  clubs: { id: string; name: string; slug: string }[];
  /** Stable slugs ordered for theming (triaz first, then randwijck). */
  clubSlugs: ("triaz" | "randwijck")[];
  assignedPersonId: string | null;
  assignedPersonName: string | null;
  /** Set when a member has asked the office to cancel; row stays active. */
  cancellationRequestedAt: Date | null;
  cancellationRequestedReason: string | null;
  /** Set when the office has actually cancelled the row. */
  cancelledAt: Date | null;
}

/**
 * Display-only snapshot of every membership row the household has ever
 * had. Returns the raw `status` string and a derived `daysUntilExpiry`
 * so the portal can render expiry banners, theming, and history.
 *
 * **Do not use this for gating.** The single source of truth for "is
 * this person/household covered right now?" is
 * `src/lib/memberships/coverage.ts` (`getActiveMembershipCoverage`,
 * `personIsCovered`, `householdHasAnyCoverage`). Those helpers honour
 * both `status === 'active'` AND `startsOn <= now <= expiresOn`,
 * whereas the snapshot here returns `active` rows whose window has
 * not yet started or has expired. Any code that wants to make an
 * access decision on a membership **must** call coverage.ts.
 */
export const getMembershipsForHousehold = cache(_getMembershipsForHousehold);

async function _getMembershipsForHousehold(
  householdId: string | null,
): Promise<MembershipDetail[]> {
  if (!householdId) return [];
  const rows = await prisma.membership.findMany({
    where: { householdId },
    include: {
      membershipClubs: { include: { club: true } },
      assignedPerson: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startsOn: "desc" },
  });
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return rows.map((m) => {
    const clubs = m.membershipClubs.map((mc) => ({
      id: mc.club.id,
      name: mc.club.name,
      slug: mc.club.slug,
    }));
    const clubSlugs: ("triaz" | "randwijck")[] = [];
    for (const slug of CONFIGURED_CLUB_SLUGS) {
      if (clubs.some((c) => c.slug === slug)) {
        clubSlugs.push(slug as "triaz" | "randwijck");
      }
    }
    // `coverageTier` is the single source of truth on the DB side.
    // Coerce anything unexpected (impossible after the M2 CHECK
    // constraint, but cheap insurance) to "adult" so the page never
    // crashes on a stray legacy value.
    const rawTier = (m as { coverageTier?: string | null }).coverageTier;
    const coverageTier: "adult" | "child" | "family" =
      rawTier === "adult" || rawTier === "child" || rawTier === "family"
        ? rawTier
        : "adult";
    const kind: "individual" | "family" =
      coverageTier === "family" ? "family" : "individual";
    return {
      id: m.id,
      kind,
      coverageTier,
      status: m.status,
      startsOn: m.startsOn,
      expiresOn: m.expiresOn,
      daysUntilExpiry: Math.floor((m.expiresOn.getTime() - now) / dayMs),
      pricePaid: m.pricePaid != null ? Number(m.pricePaid) : null,
      clubs,
      clubSlugs,
      assignedPersonId: m.assignedPersonId,
      assignedPersonName: m.assignedPerson
        ? `${m.assignedPerson.firstName} ${m.assignedPerson.lastName}`.trim()
        : null,
      cancellationRequestedAt: m.cancellationRequestedAt,
      cancellationRequestedReason: m.cancellationRequestedReason,
      cancelledAt: m.cancelledAt,
    };
  });
}

export async function getHouseholdBuyContext(
  householdId: string | null,
  buyerPersonId: string,
): Promise<HouseholdOwnership> {
  if (!householdId) {
    return { seats: [], householdMembers: [], buyerPersonId };
  }

  // Coverage gate: only count memberships that are active AND inside
  // the [startsOn, expiresOn] window. Aligned with the SSOT in
  // `src/lib/memberships/coverage.ts` so pricing / upgrade-credit math
  // and "is the household covered" gating never disagree.
  const now = new Date();
  const [memberships, members] = await Promise.all([
    prisma.membership.findMany({
      where: {
        householdId,
        status: "active",
        startsOn: { lte: now },
        expiresOn: { gte: now },
      },
      include: { membershipClubs: { include: { club: true } } },
    }),
    prisma.householdMember.findMany({
      where: { householdId },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            student: { select: { personId: true } },
          },
        },
      },
    }),
  ]);

  const seats: HouseholdOwnership["seats"] = [];
  for (const membership of memberships) {
    const tier = membership.coverageTier as MembershipTier;
    if (tier !== "adult" && tier !== "child" && tier !== "family") continue;
    for (const mc of membership.membershipClubs) {
      const slug = mc.club.slug;
      if (!CONFIGURED_CLUB_SLUGS.includes(slug)) continue;
      seats.push({
        membershipId: membership.id,
        tier,
        clubSlug: slug as "triaz" | "randwijck",
        assignedPersonId: membership.assignedPersonId,
      });
    }
  }

  return {
    seats,
    householdMembers: members.map((m) => ({
      personId: m.person.id,
      firstName: m.person.firstName,
      lastName: m.person.lastName,
      isAdult: m.roleInHousehold === "adult",
      isStudent: !!m.person.student,
    })),
    buyerPersonId,
  };
}

export interface HouseholdMemberSummary {
  personId: string;
  firstName: string;
  lastName: string;
  role: "adult" | "child";
  /** Age in whole years if dateOfBirth is set. */
  age: number | null;
  /** YYYY-MM-DD or null — handy for pre-filling <input type="date"> fields. */
  dateOfBirthIso: string | null;
  isStudent: boolean;
  studentSchool: string | null;
  studentSkillLevel: string | null;
  studentMedalLevel: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  avatarUrl: string | null;
}

export const getHouseholdMembers = cache(_getHouseholdMembers);

async function _getHouseholdMembers(
  householdId: string | null,
): Promise<HouseholdMemberSummary[]> {
  if (!householdId) return [];
  const members = await prisma.householdMember.findMany({
    where: { householdId },
    include: {
      person: {
        include: { student: true },
      },
    },
  });
  return members.map((m) => ({
    personId: m.person.id,
    firstName: m.person.firstName,
    lastName: m.person.lastName,
    role: m.roleInHousehold as "adult" | "child",
    age: ageFromDob(m.person.dateOfBirth),
    dateOfBirthIso: m.person.dateOfBirth
      ? m.person.dateOfBirth.toISOString().slice(0, 10)
      : null,
    isStudent: !!m.person.student,
    studentSchool: m.person.student?.school ?? null,
    studentSkillLevel: m.person.student?.skillLevel ?? null,
    studentMedalLevel: m.person.student?.medalLevel ?? null,
    emergencyContactName: m.person.emergencyContactName,
    emergencyContactPhone: m.person.emergencyContactPhone,
    emergencyContactRelationship: m.person.emergencyContactRelationship,
    avatarUrl: m.person.avatarUrl,
  }));
}

/**
 * Verify that `parentPersonId` is an adult in the same household as
 * `childPersonId`. Used to gate parent-initiated edits on a child's
 * profile so a stranger can't pass an arbitrary id and modify them.
 */
export async function isGuardianOf(
  parentPersonId: string,
  childPersonId: string,
): Promise<boolean> {
  const parent = await prisma.householdMember.findUnique({
    where: { personId: parentPersonId },
    select: { householdId: true, roleInHousehold: true },
  });
  if (!parent || parent.roleInHousehold !== "adult") return false;
  const child = await prisma.householdMember.findUnique({
    where: { personId: childPersonId },
    select: { householdId: true, roleInHousehold: true },
  });
  if (!child) return false;
  return (
    child.householdId === parent.householdId && child.roleInHousehold === "child"
  );
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
