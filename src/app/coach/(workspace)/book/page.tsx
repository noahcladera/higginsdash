import Link from "next/link";
import { Suspense } from "react";
import { requireCoach } from "@/lib/auth/require-coach";
import { clubsWhereIds } from "@/lib/coach/club-scope";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CourtCalendarGrid } from "@/components/booking/court-calendar-grid";
import { BookClubPicker } from "@/components/booking/book-club-picker";
import { getCalendarWeek } from "@/lib/booking/queries";
import {
  formatLocalDate,
  parseLocalDate,
  amsterdamMidnightUtc,
  addDays,
} from "@/lib/booking/time";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { BookingDateJumpForm } from "@/components/booking/booking-date-jump-form";
import { CalendarPagerTransition } from "@/app/portal/_components/calendar-pager-transition";
import { getTerms } from "@/lib/tenant";
import { buildBookPageHref } from "@/lib/booking/book-page-href";

interface PageProps {
  searchParams: Promise<{
    club?: string;
    date?: string;
    court?: string;
    slot?: string;
  }>;
}

export default async function CoachBookPage({ searchParams }: PageProps) {
  const { person, allowedClubIds } = await requireCoach();
  const terms = await getTerms();
  const sp = await searchParams;

  const clubs = await prisma.club.findMany({
    where: { isActive: true, ...clubsWhereIds(allowedClubIds) },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  if (clubs.length === 0) {
    return (
      <div className="space-y-10">
        <ShellPageHeader
          kicker={terms.coach.role}
          title={`${terms.bookVerb} ${terms.privateLesson.plural.toLowerCase()} & ${terms.court.plural.toLowerCase()}`}
          description="Pick a location, pick a slot."
        />
        <EmptyState
          icon={<CalendarIcon size={20} />}
          title="No clubs configured"
          description="Ask an admin to set up at least one club."
        />
      </div>
    );
  }

  const activeClub = clubs.find((c) => c.slug === sp.club) ?? clubs[0];
  const date = sp.date ?? formatLocalDate(new Date());
  const parsed = parseLocalDate(date);
  const dateUtc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);

  const data = await getCalendarWeek({
    clubId: activeClub.id,
    startDate: date,
    days: 1,
    viewerRole: "coach",
  });

  const today = formatLocalDate(new Date());
  const isToday = date === today;
  const dayLabel = formatLongDay(dateUtc);
  const pagerKey = `${activeClub.slug}:${date}`;
  const activeCourtId =
    sp.court && data.courts.some((c) => c.id === sp.court) ? sp.court : undefined;

  const dayHref = (d: string) =>
    buildBookPageHref("/coach/book", {
      club: activeClub.slug,
      date: d,
      court: activeCourtId,
    });

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker={terms.coach.role}
        title={`${terms.bookVerb} ${terms.privateLesson.plural.toLowerCase()} & ${terms.court.plural.toLowerCase()}`}
        description={`Tap an open slot to book a ${terms.privateLesson.singular.toLowerCase()}. ${terms.privateLesson.singular} cancellations need admin approval.`}
      />

      <div className="flex flex-col gap-4">
        <BookClubPicker
          clubs={clubs.map((c) => ({ slug: c.slug, name: c.name }))}
          activeSlug={activeClub.slug}
          date={date}
          courtId={activeCourtId}
          basePath="/coach/book"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Button asChild variant="ghost" tone="neutral" size="icon">
              <Link
                aria-label="Previous day"
                href={dayHref(formatLocalDate(addDays(dateUtc, -1)))}
                className="group/scrub"
              >
                <span
                  aria-hidden
                  className="inline-flex transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover/scrub:-translate-x-0.5"
                >
                  <ChevronLeftIcon />
                </span>
              </Link>
            </Button>
            <div className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm">
              <span className="font-display text-base font-medium leading-none tracking-tight">
                {dayLabel}
              </span>
              {isToday && (
                <span className="ml-2 inline-flex items-center rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
                  Today
                </span>
              )}
            </div>
            <Button asChild variant="ghost" tone="neutral" size="icon">
              <Link
                aria-label="Next day"
                href={dayHref(formatLocalDate(addDays(dateUtc, 1)))}
                className="group/scrub"
              >
                <span
                  aria-hidden
                  className="inline-flex transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover/scrub:translate-x-0.5"
                >
                  <ChevronRightIcon />
                </span>
              </Link>
            </Button>
            {!isToday && (
              <Button asChild variant="ghost" tone="neutral" size="sm">
                <Link href={dayHref(today)}>
                  Today
                </Link>
              </Button>
            )}
            <BookingDateJumpForm
              basePath="/coach/book"
              clubSlug={activeClub.slug}
              date={date}
              className="ml-1"
              dateFieldSize="compact"
            />
          </div>
        </div>
      </div>

      <CalendarPagerTransition pagerKey={pagerKey} compareKind="dateThenSlug">
        <div className="glass-regular md:elev-card overflow-hidden p-2 sm:p-4">
          <Suspense fallback={<div className="min-h-48 animate-pulse rounded-md bg-[var(--muted)]/30" />}>
            <CourtCalendarGrid
              key={`${activeClub.slug}:${date}`}
              data={data}
              viewerRole="coach"
              viewerPersonId={person.id}
              initialSlotIso={sp.slot}
              bookNavigation={{
                basePath: "/coach/book",
                clubSlug: activeClub.slug,
                date,
                courtId: activeCourtId,
              }}
            />
          </Suspense>
        </div>
      </CalendarPagerTransition>
    </div>
  );
}

function formatLongDay(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}
