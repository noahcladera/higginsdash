import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { CourtCalendarGrid } from "@/components/booking/court-calendar-grid";
import { getCalendarWeek } from "@/lib/booking/queries";
import {
  formatLocalDate,
  addDays,
  parseLocalDate,
  amsterdamMidnightUtc,
  amsterdamDayOfWeek,
} from "@/lib/booking/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { BookingDateJumpForm } from "@/components/booking/booking-date-jump-form";
import { listCoachesForAdminFilter } from "@/lib/admin/classes-queries";

interface PageProps {
  searchParams: Promise<{
    club?: string;
    date?: string;
    view?: "day" | "week";
  }>;
}

/**
 * Admin court-booking calendar.
 *
 *   - view=day  (default): single day, all courts.
 *   - view=week:           one ISO week (Mon–Sun) rendered as two stacked
 *                          tables (Mon–Thu on top, Fri–Sun below) so every
 *                          court of the club fits at a readable width
 *                          without losing the "whole week at a glance"
 *                          property on a desktop.
 */
export default async function AdminBookingsPage({ searchParams }: PageProps) {
  const { person } = await requireAdmin();
  const sp = await searchParams;
  const view: "day" | "week" = sp.view === "week" ? "week" : "day";

  const clubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  if (clubs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader kicker="Admin" title="Bookings" description="Court calendar" />
        <EmptyState
          title="No clubs configured yet"
          description="Add a club from the catalog before opening the court calendar."
        />
      </div>
    );
  }

  const activeClubSlug = sp.club ?? clubs[0].slug;
  const activeClub = clubs.find((c) => c.slug === activeClubSlug) ?? clubs[0];

  const today = formatLocalDate(new Date());
  const date = sp.date ?? today;
  const parsed = parseLocalDate(date);
  const dateUtc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);

  // For week view, snap the anchor date back to the Monday that starts that
  // ISO week so prev/next/today nav is always week-aligned.
  const weekStartUtc = startOfIsoWeekUtc(dateUtc);
  const weekStartDate = formatLocalDate(weekStartUtc);

  const queryStart = view === "week" ? weekStartDate : date;
  const days = view === "week" ? 7 : 1;

  const [data, coachOptions] = await Promise.all([
    getCalendarWeek({
      clubId: activeClub.id,
      startDate: queryStart,
      days,
      viewerRole: "admin",
    }),
    listCoachesForAdminFilter(),
  ]);

  const allDayDates = data.days.map((d) => d.date);
  // Week view: stack the week as 4 days on top and 3 days below so admins
  // can scan the whole week at a glance on a desktop. Day view: one row.
  const dayRows: string[][] =
    view === "week"
      ? [allDayDates.slice(0, 4), allDayDates.slice(4, 7)]
      : [allDayDates];

  const [pendingDeletions, pendingRecurringRequests] = await Promise.all([
    prisma.courtBooking.count({
      where: { status: "cancellation_requested" },
    }),
    prisma.recurringBlock.count({ where: { status: "pending" } }),
  ]);

  // Day-view nav (anchored on `date`).
  const prevDate = formatLocalDate(addDays(dateUtc, -1));
  const nextDate = formatLocalDate(addDays(dateUtc, 1));
  // Week-view nav (anchored on `weekStartDate`).
  const prevWeekDate = formatLocalDate(addDays(weekStartUtc, -7));
  const nextWeekDate = formatLocalDate(addDays(weekStartUtc, 7));
  const thisWeekStart = formatLocalDate(
    startOfIsoWeekUtc(amsterdamMidnightUtc(
      parseLocalDate(today).year,
      parseLocalDate(today).month,
      parseLocalDate(today).day,
    )),
  );

  const buildHref = (overrides: Partial<{ date: string; view: string; club: string }>) => {
    const params = new URLSearchParams();
    params.set("club", overrides.club ?? activeClub.slug);
    params.set("date", overrides.date ?? (view === "week" ? weekStartDate : date));
    params.set("view", overrides.view ?? view);
    return `/admin/bookings?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Court calendar"
        description="See who is on court. Book for a coach or member, block time, or handle cancellation requests."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {pendingRecurringRequests > 0 && (
              <Button asChild variant="outline">
                <Link href="/admin/blocks/requests">
                  Recurring requests
                  <Badge tone="warning" variant="soft" className="ml-2">
                    {pendingRecurringRequests}
                  </Badge>
                </Link>
              </Button>
            )}
            {pendingDeletions > 0 && (
              <Button asChild variant="outline">
                <Link href="/admin/bookings/deletions">
                  Pending deletions
                  <Badge tone="warning" variant="soft" className="ml-2">
                    {pendingDeletions}
                  </Badge>
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Club tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {clubs.map((c) => (
          <Link
            key={c.id}
            href={buildHref({ club: c.slug })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              c.id === activeClub.id
                ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
                : "border border-[var(--border)] hover:bg-[var(--muted)]",
            )}
          >
            {c.name}
          </Link>
        ))}

        {/* View toggle */}
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-[var(--border)] text-sm">
          <Link
            href={buildHref({ view: "day" })}
            className={cn(
              "px-3 py-1.5 transition-colors",
              view === "day"
                ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
                : "hover:bg-[var(--muted)]",
            )}
          >
            Day
          </Link>
          <Link
            href={buildHref({ view: "week" })}
            className={cn(
              "border-l border-[var(--border)] px-3 py-1.5 transition-colors",
              view === "week"
                ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
                : "hover:bg-[var(--muted)]",
            )}
          >
            Week
          </Link>
        </div>
      </div>

      {/* Nav controls — different per view */}
      {view === "day" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: prevDate })}>← Prev</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: today })}>Today</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: nextDate })}>Next →</Link>
          </Button>
          <BookingDateJumpForm
            basePath="/admin/bookings"
            clubSlug={activeClub.slug}
            date={date}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: prevWeekDate })}>← Prev week</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: thisWeekStart })}>This week</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref({ date: nextWeekDate })}>Next week →</Link>
          </Button>

          <div className="ml-auto text-xs text-[var(--muted-foreground)]">
            Week of {weekStartDate}
          </div>
        </div>
      )}

      <CourtCalendarGrid
        data={data}
        view={view}
        dayRows={dayRows}
        viewerRole="admin"
        viewerPersonId={person.id}
        coachOptions={coachOptions}
      />
    </div>
  );
}

/** Snap any UTC midnight to the Monday-start of its ISO week, in UTC.
 *
 * Uses the Amsterdam-local day-of-week so the snap is correct even when
 * `dateUtc` is the UTC moment of local-midnight (which lives in the
 * previous UTC day under CET/CEST).
 */
function startOfIsoWeekUtc(dateUtc: Date): Date {
  return addDays(dateUtc, -amsterdamDayOfWeek(dateUtc));
}
