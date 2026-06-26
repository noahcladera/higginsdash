import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { clubsWhereIds } from "@/lib/coach/club-scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CourtCalendarGrid } from "@/components/booking/court-calendar-grid";
import { getCalendarWeek } from "@/lib/booking/queries";
import {
  formatLocalDate,
  parseLocalDate,
  amsterdamMidnightUtc,
  addDays,
} from "@/lib/booking/time";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { BookingDateJumpForm } from "@/components/booking/booking-date-jump-form";
import { getTerms } from "@/lib/tenant";

interface PageProps {
  searchParams: Promise<{ club?: string; date?: string }>;
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
      <div className="space-y-8">
        <PageHeader
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

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={terms.coach.role}
        title={`${terms.bookVerb} ${terms.privateLesson.plural.toLowerCase()} & ${terms.court.plural.toLowerCase()}`}
        description={`Tap an open slot to book a ${terms.privateLesson.singular.toLowerCase()}. ${terms.privateLesson.singular} cancellations need admin approval.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Clubs"
          className="inline-flex items-center rounded-full bg-[var(--surface)] p-1"
        >
          {clubs.map((c) => {
            const active = c.id === activeClub.id;
            return (
              <Link
                key={c.id}
                role="tab"
                aria-selected={active}
                href={`/coach/book?club=${c.slug}&date=${date}`}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  active
                    ? "control-well text-[var(--foreground)] font-medium shadow-[var(--shadow-elevated)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" tone="neutral" size="icon">
            <Link
              aria-label="Previous day"
              href={`/coach/book?club=${activeClub.slug}&date=${formatLocalDate(addDays(dateUtc, -1))}`}
            >
              <ChevronLeftIcon />
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
              href={`/coach/book?club=${activeClub.slug}&date=${formatLocalDate(addDays(dateUtc, 1))}`}
            >
              <ChevronRightIcon />
            </Link>
          </Button>
          {!isToday && (
            <Button asChild variant="ghost" tone="neutral" size="sm">
              <Link href={`/coach/book?club=${activeClub.slug}&date=${today}`}>
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

      <div className="elev-card overflow-hidden p-2 sm:p-4">
        <CourtCalendarGrid
          data={data}
          viewerRole="coach"
          viewerPersonId={person.id}
        />
      </div>
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
