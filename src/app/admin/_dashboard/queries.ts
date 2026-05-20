/**
 * Admin dashboard data — one fan-out query per render.
 *
 * Anchored to "today in Europe/Amsterdam" so the schedule lines match
 * what the front desk reads off the wall, not whatever clock the Node
 * server happens to be running. Same pattern as `src/app/coach/(workspace)/page.tsx`.
 *
 * All fetches go through `Promise.all` (NOT `prisma.$transaction`) so
 * pgbouncer can spread them across the pool — see the existing comment
 * in the previous version of `src/app/admin/page.tsx`.
 */

import { prisma } from "@/lib/prisma";
import {
  addDays,
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";
import {
  getAdminPendingCounts,
  getUnreadCount,
  type AdminPendingCounts,
} from "@/lib/inbox/queries";
import { mergeEffectiveCoaches } from "@/lib/classes/effective-coaches";

export interface DashboardClassRow {
  id: string;
  seriesId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  programName: string;
  seriesName: string;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string;
  schoolName: string | null;
  courtName: string | null;
  enrolledCount: number;
  coaches: Array<{
    personId: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isSubstitute: boolean;
  }>;
}

export interface DashboardBookingRow {
  id: string;
  startsAt: Date;
  endsAt: Date;
  purpose: "personal" | "coaching";
  status: string;
  cancellationRequestedAt: Date | null;
  clubName: string;
  courtName: string;
  bookedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
  partners: Array<{ id: string; partnerName: string }>;
}

export interface DashboardInboxRow {
  id: string;
  subject: string | null;
  body: string;
  templateKey: string;
  relatedTable: string | null;
  relatedRowId: string | null;
  createdAt: Date;
}

export interface DashboardSignupRow {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  isStudent: boolean;
  household: { id: string; displayName: string } | null;
}

export interface DashboardTotals {
  people: number;
  peopleArchivedIncl: number;
  households: number;
  householdsArchivedIncl: number;
  students: number;
  coaches: number;
  clubs: number;
  courts: number;
  venues: number;
  programs: number;
  classSeries: number;
  blocks: number;
}

export interface AdminDashboardData {
  todayLocal: string;
  todayStartUtc: Date;
  todayEndUtc: Date;
  todaysClasses: DashboardClassRow[];
  coachesWorkingToday: number;
  todaysBookings: DashboardBookingRow[];
  unreadInbox: DashboardInboxRow[];
  unreadInboxTotal: number;
  recentSignups: DashboardSignupRow[];
  pending: AdminPendingCounts;
  totals: DashboardTotals;
}

export async function getAdminDashboardData(
  adminPersonId: string,
): Promise<AdminDashboardData> {
  const todayLocal = formatLocalDate(new Date());
  const t = parseLocalDate(todayLocal);
  const todayStartUtc = amsterdamMidnightUtc(t.year, t.month, t.day);
  const todayEndUtc = addDays(todayStartUtc, 1);
  const sevenDaysAgo = addDays(todayStartUtc, -7);

  const [
    todaysSessions,
    todaysBookingsRaw,
    unreadInboxRaw,
    unreadInboxTotal,
    recentSignupsRaw,
    pending,
    peopleCount,
    activePeopleCount,
    householdCount,
    activeHouseholdCount,
    coachCount,
    studentCount,
    clubCount,
    courtCount,
    venueCount,
    programCount,
    classSeriesCount,
    blockCount,
  ] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        startsAt: { gte: todayStartUtc, lt: todayEndUtc },
        cancelledAt: null,
        status: { not: "cancelled" },
      },
      include: {
        classSeries: {
          select: {
            id: true,
            name: true,
            deliveryMode: true,
            program: { select: { name: true } },
            venue: { select: { name: true } },
            school: { select: { name: true } },
            // Series-default lineup. We merge these with per-session
            // overrides below so series-level coaches show up on the
            // dashboard even when no session-level row exists.
            coaches: {
              select: {
                coachPersonId: true,
                role: true,
                coach: {
                  select: {
                    person: {
                      select: { id: true, firstName: true, lastName: true },
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
        },
        court: { select: { name: true } },
        coaches: {
          select: {
            coachPersonId: true,
            role: true,
            isSubstitute: true,
            substitutingForPersonId: true,
            coach: {
              select: {
                person: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.courtBooking.findMany({
      where: {
        startsAt: { gte: todayStartUtc, lt: todayEndUtc },
        status: { in: ["confirmed", "cancellation_requested"] },
      },
      include: {
        court: { select: { name: true } },
        club: { select: { name: true } },
        bookedByPerson: {
          select: { id: true, firstName: true, lastName: true },
        },
        partners: {
          select: { id: true, partnerName: true, displayOrder: true },
          orderBy: { displayOrder: "asc" },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.notification.findMany({
      where: {
        recipientPersonId: adminPersonId,
        channel: "in_app",
        readAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    getUnreadCount(adminPersonId),
    prisma.person.findMany({
      where: {
        archivedAt: null,
        createdAt: { gte: sevenDaysAgo },
      },
      include: {
        student: { select: { personId: true } },
        householdMember: {
          select: {
            household: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    getAdminPendingCounts(),
    prisma.person.count(),
    prisma.person.count({ where: { archivedAt: null } }),
    prisma.household.count(),
    prisma.household.count({ where: { archivedAt: null } }),
    prisma.coach.count(),
    prisma.student.count(),
    prisma.club.count(),
    prisma.court.count(),
    prisma.venue.count({ where: { archivedAt: null } }),
    prisma.program.count(),
    prisma.classSeries.count({ where: { archivedAt: null } }),
    prisma.recurringBlock.count(),
  ]);

  const todaysClasses: DashboardClassRow[] = todaysSessions.map((s) => ({
    id: s.id,
    seriesId: s.classSeries.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
    programName: s.classSeries.program.name,
    seriesName: s.classSeries.name,
    deliveryMode: s.classSeries.deliveryMode,
    venueName: s.classSeries.venue.name,
    schoolName: s.classSeries.school?.name ?? null,
    courtName: s.court?.name ?? null,
    enrolledCount: s.classSeries._count.enrollments,
    coaches: mergeEffectiveCoaches(s.classSeries.coaches, s.coaches),
  }));

  // Distinct coach count for the metric strip — counts every person on
  // the floor today across both classes and coaching court bookings.
  const coachIds = new Set<string>();
  for (const c of todaysClasses) {
    for (const co of c.coaches) coachIds.add(co.personId);
  }
  for (const b of todaysBookingsRaw) {
    if (b.purpose === "coaching") coachIds.add(b.bookedByPersonId);
  }

  const todaysBookings: DashboardBookingRow[] = todaysBookingsRaw.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    purpose: b.purpose,
    status: b.status,
    cancellationRequestedAt: b.cancellationRequestedAt,
    clubName: b.club.name,
    courtName: b.court.name,
    bookedBy: {
      id: b.bookedByPerson.id,
      firstName: b.bookedByPerson.firstName,
      lastName: b.bookedByPerson.lastName,
    },
    partners: b.partners.map((p) => ({
      id: p.id,
      partnerName: p.partnerName,
    })),
  }));

  const unreadInbox: DashboardInboxRow[] = unreadInboxRaw.map((n) => ({
    id: n.id,
    subject: n.subject,
    body: n.bodyText,
    templateKey: n.templateKey,
    relatedTable: n.relatedTable,
    relatedRowId: n.relatedRowId,
    createdAt: n.createdAt,
  }));

  const recentSignups: DashboardSignupRow[] = recentSignupsRaw.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    createdAt: p.createdAt,
    isStudent: !!p.student,
    household: p.householdMember?.household
      ? {
          id: p.householdMember.household.id,
          displayName: p.householdMember.household.displayName,
        }
      : null,
  }));

  return {
    todayLocal,
    todayStartUtc,
    todayEndUtc,
    todaysClasses,
    coachesWorkingToday: coachIds.size,
    todaysBookings,
    unreadInbox,
    unreadInboxTotal,
    recentSignups,
    pending,
    totals: {
      people: activePeopleCount,
      peopleArchivedIncl: peopleCount,
      households: activeHouseholdCount,
      householdsArchivedIncl: householdCount,
      students: studentCount,
      coaches: coachCount,
      clubs: clubCount,
      courts: courtCount,
      venues: venueCount,
      programs: programCount,
      classSeries: classSeriesCount,
      blocks: blockCount,
    },
  };
}
