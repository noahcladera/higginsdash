import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
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
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";
import { MembershipGate } from "./membership-gate";
import { getMarketingImages } from "@/lib/uploads/marketing-images";
import { getActiveMembershipCoverage } from "@/lib/memberships/coverage";
import { BookingDateJumpForm } from "@/components/booking/booking-date-jump-form";
import { CalendarPagerTransition } from "../_components/calendar-pager-transition";

interface PageProps {
  searchParams: Promise<{ club?: string; date?: string }>;
}

/**
 * Member-facing booking calendar.
 *
 * - Page header with day-pretty label.
 * - Segmented club picker (only clubs the household actually has coverage at).
 * - Date scrubber: prev / today / next + native date picker.
 * - The court grid is unchanged for now (own slice); we just dress it.
 */
export default async function PortalBookPage({ searchParams }: PageProps) {
  const { person, householdId } = await requireMember();
  const t = await getTerms();
  const sp = await searchParams;

  // Per-person coverage: which clubs is the *booker themselves*
  // covered at right now? A parent on a child-only household seat
  // wouldn't be able to actually book here (R-membership), so we hide
  // those clubs from the chooser too. Same source of truth as
  // `createBooking` and the series enrollment panel.
  const allActiveClubs = await prisma.club.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  let memberClubs: typeof allActiveClubs = [];
  if (householdId) {
    const coverage = await getActiveMembershipCoverage({
      householdId,
      candidatePersonIds: [person.id],
    });
    const coveredSlugs = new Set(coverage.clubsForPerson(person.id));
    memberClubs = allActiveClubs.filter((c) => {
      const slug = c.slug.toLowerCase();
      return slug === "triaz" || slug === "randwijck"
        ? coveredSlugs.has(slug)
        : false;
    });
  }

  if (memberClubs.length === 0) {
    // No active membership — show the rich "choose a club" gate instead
    // of an empty card. We display every active club, not just the ones
    // the household covers, so first-time visitors can browse + buy.
    const [allClubs, marketingImages] = await Promise.all([
      Promise.resolve(allActiveClubs),
      getMarketingImages(),
    ]);
    return (
      <div className="space-y-8">
        <PageHeader
          kicker={t.bookVerb}
          title={`${t.bookVerb} a ${t.court.singular.toLowerCase()}`}
          description={`Pick a ${t.club.singular.toLowerCase()}, then a slot. To ${t.bookVerb.toLowerCase()}, you'll need an active ${t.membership.singular.toLowerCase()} at that ${t.club.singular.toLowerCase()}.`}
        />
        <MembershipGate clubs={allClubs} marketingImages={marketingImages} />
      </div>
    );
  }

  const activeClub =
    memberClubs.find((c) => c.slug === sp.club) ?? memberClubs[0];
  const date = sp.date ?? formatLocalDate(new Date());
  const parsed = parseLocalDate(date);
  const dateUtc = amsterdamMidnightUtc(parsed.year, parsed.month, parsed.day);

  const data = await getCalendarWeek({
    clubId: activeClub.id,
    startDate: date,
    days: 1,
    viewerRole: "member",
  });

  const today = formatLocalDate(new Date());
  const isToday = date === today;
  const dayLabel = formatLongDay(dateUtc);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={t.bookVerb}
        title={`${t.bookVerb} a ${t.court.singular.toLowerCase()}`}
        description="Tap an open slot to book under your account. Add partners if someone else is playing with you. Cancellations within 24 hours are reviewed."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Segmented club picker */}
        <div
          role="tablist"
          aria-label="Clubs"
          className="inline-flex items-center rounded-full bg-[var(--surface)] p-1"
        >
          {memberClubs.map((c) => {
            const active = c.id === activeClub.id;
            return (
              <Link
                key={c.id}
                role="tab"
                aria-selected={active}
                href={`/portal/book?club=${c.slug}&date=${date}`}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm transition-colors",
                  active
                    ? "control-well text-[var(--foreground)] shadow-[var(--shadow-elevated)] font-medium"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </div>

        {/* Date scrubber — `group/scrub` lets the inner arrow glyphs
         * react to hover on the whole button, signaling the slide
         * direction the calendar will play after navigation. */}
        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" tone="neutral" size="icon">
            <Link
              aria-label="Previous day"
              href={`/portal/book?club=${activeClub.slug}&date=${formatLocalDate(addDays(dateUtc, -1))}`}
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
              href={`/portal/book?club=${activeClub.slug}&date=${formatLocalDate(addDays(dateUtc, 1))}`}
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
              <Link href={`/portal/book?club=${activeClub.slug}&date=${today}`}>
                Today
              </Link>
            </Button>
          )}
          <BookingDateJumpForm
            basePath="/portal/book"
            clubSlug={activeClub.slug}
            date={date}
            className="ml-1"
            dateFieldSize="compact"
          />
        </div>
      </div>

      <div className="elev-panel overflow-hidden p-2 sm:p-4">
        {/* Re-key on the (club, date) pair so the slide plays both
         * when stepping days and when switching clubs. ISO date sorts
         * lexicographically, club slug ties broken alphabetically —
         * good enough for direction detection. */}
        <CalendarPagerTransition
          pagerKey={`${activeClub.slug}:${date}`}
          compareKind="dateThenSlug"
        >
          <CourtCalendarGrid
            data={data}
            viewerRole="member"
            viewerPersonId={person.id}
          />
        </CalendarPagerTransition>
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
