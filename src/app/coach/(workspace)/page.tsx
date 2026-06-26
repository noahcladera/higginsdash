import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Stat, MetricStrip } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon,
  PlusIcon,
  ClockIcon,
  ArrowRightIcon,
} from "@/components/icons";
import {
  amsterdamMidnightUtc,
  formatLocalDate,
  parseLocalDate,
  addDays,
} from "@/lib/booking/time";
import { cn } from "@/lib/utils";
import {
  getCoachUpcomingClasses,
  flattenCoachSessions,
} from "@/lib/classes/queries";
import { courtBookingClubFilter } from "@/lib/coach/club-scope";
import {
  computeClassTiming,
  formatTimingLine,
  deliveryModeLabel,
} from "@/lib/classes/timing";
import { getCoachCalendarEvents } from "@/lib/coach/calendar-queries";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import {
  daysOfWeek,
  formatWeekRange,
  mondayOfWeekUtc,
} from "@/lib/calendar/week";
import { MiniWeekGrid } from "./_components/mini-week-grid";

/**
 * Coach landing page. Vertical timeline of today's bookings + a metric
 * strip with the daily summary (sessions, hours, students, pending deletions).
 */
export default async function CoachHomePage() {
  const { person, allowedClubIds } = await requireCoach();
  const [t, brand] = await Promise.all([getTerms(), getCurrentBrand()]);
  const bookingClub = courtBookingClubFilter(allowedClubIds);

  const today = formatLocalDate(new Date());
  const todayParts = parseLocalDate(today);
  const todayStartUtc = amsterdamMidnightUtc(todayParts.year, todayParts.month, todayParts.day);
  const todayEndUtc = addDays(todayStartUtc, 1);
  const weekStart = mondayOfWeekUtc(new Date());

  const [todays, pendingMine, todaysClasses, weekEvents] =
    await Promise.all([
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: person.id,
        startsAt: { gte: todayStartUtc, lt: todayEndUtc },
        status: { in: ["confirmed", "cancellation_requested"] },
        ...bookingClub,
      },
      include: { court: true, club: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.courtBooking.count({
      where: {
        bookedByPersonId: person.id,
        status: "cancellation_requested",
        ...bookingClub,
      },
    }),
    getCoachUpcomingClasses(person.id, 1, { allowedClubIds }),
    getCoachCalendarEvents(person.id, weekStart, { allowedClubIds }),
  ]);

  const todaysClassRows = flattenCoachSessions(todaysClasses);
  const weekSessions = weekEvents.flatMap((e) =>
    e.kind === "session" ? [e] : [],
  );
  const weekDays = daysOfWeek(weekStart);

  // "On today" = personal court bookings + classes assigned to this coach.
  const onTodayCount = todays.length + todaysClassRows.length;

  const courtMinutesToday = todays.reduce(
    (acc, b) => acc + minutesBetween(b.startsAt, b.endsAt),
    0,
  );
  // On-court teaching minutes (class start→end), excluding pickup travel.
  const classMinutesToday = todaysClassRows.reduce(
    (acc, { session }) => acc + minutesBetween(session.startsAt, session.endsAt),
    0,
  );
  const totalMinutesToday = courtMinutesToday + classMinutesToday;

  const coachingCourtMinutesToday = todays
    .filter((b) => b.purpose === "coaching")
    .reduce((acc, b) => acc + minutesBetween(b.startsAt, b.endsAt), 0);
  const coachingMinutesToday = coachingCourtMinutesToday + classMinutesToday;

  // "This week" = on-court teaching minutes from class sessions + coaching
  // court bookings, aligned to the Mon→Sun week shown in the grid below.
  const weekClassMinutes = weekSessions.reduce(
    (acc, s) => acc + minutesBetween(s.classStartAt, s.classEndAt),
    0,
  );
  const weekBookings = weekEvents.flatMap((e) =>
    e.kind === "booking" ? [e] : [],
  );
  const weekCoachingBookingMinutes = weekBookings.reduce(
    (acc, b) => acc + minutesBetween(b.startsAt, b.endsAt),
    0,
  );
  const weekMinutes = weekClassMinutes + weekCoachingBookingMinutes;

  const greeting = `${greetingWord()}, ${person.firstName || t.coach.singular.toLowerCase()}.`;
  const subtitle = onTodayCount
    ? `${onTodayCount} thing${onTodayCount === 1 ? "" : "s"} on the books today.`
    : "Quiet day ahead. Want to add a session?";

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={t.coach.role}
        title={greeting}
        description={subtitle}
        actions={
          <Button asChild tone="triaz">
            <Link href="/coach/book">
              <PlusIcon /> {t.bookVerb} a {t.court.singular.toLowerCase()}
            </Link>
          </Button>
        }
      />

      {pendingMine > 0 && (
        <div className="fade-in flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-5 py-3 text-sm text-[var(--warning-ink)]">
          <span>
            {pendingMine} deletion request{pendingMine === 1 ? "" : "s"}{" "}
            awaiting an admin decision.
          </span>
          <Button asChild variant="ghost" size="sm" tone="neutral">
            <Link href="/coach/bookings">
              View bookings <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      )}

      <MetricStrip>
        <Stat
          label="On today"
          value={onTodayCount || "—"}
          hint={
            onTodayCount === 0
              ? "Nothing scheduled"
              : `${formatHours(totalMinutesToday)} on ${t.court.singular.toLowerCase()}`
          }
          tone="triaz"
        />
        <Stat
          label={`${t.privateLesson.plural} + ${t.class.plural}`}
          value={
            coachingMinutesToday > 0
              ? formatHours(coachingMinutesToday)
              : "—"
          }
          hint={
            coachingMinutesToday === 0
              ? `No ${t.privateLesson.plural.toLowerCase()} or ${t.class.plural.toLowerCase()}`
              : "billable"
          }
          tone="joint"
        />
        <Stat
          label="This week"
          value={formatHours(weekMinutes)}
          hint={`${t.privateLesson.plural.toLowerCase()} + ${t.class.plural.toLowerCase()}, Mon–Sun`}
        />
        <Stat
          label="Pending review"
          value={pendingMine || "—"}
          hint={pendingMine ? "deletion requests" : "all clear"}
          tone={pendingMine ? "warning" : "neutral"}
        />
      </MetricStrip>

      {todaysClassRows.length > 0 && (
        <Section
          title={`Today's ${t.class.plural.toLowerCase()}`}
          description={`${todaysClassRows.length} ${todaysClassRows.length === 1 ? t.class.singular.toLowerCase() : t.class.plural.toLowerCase()} with your name on them.`}
        >
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)]">
            {todaysClassRows.map(({ series, session }) => {
              const timing = computeClassTiming({
                session,
                series: {
                  deliveryMode: series.deliveryMode,
                  pickupAt: series.pickupAt,
                },
                school: series.school,
              });
              const modeTone =
                series.deliveryMode === "pickup"
                  ? "joint"
                  : series.deliveryMode === "onsite"
                    ? "warning"
                    : series.venue.kind === "club"
                      ? "triaz"
                      : "neutral";
              const venueLine =
                series.deliveryMode === "pickup" && series.school
                  ? `${series.school.name} → ${series.venue.name}`
                  : series.venue.name;
              const headlineTime =
                series.deliveryMode === "pickup" && timing.coachArriveAt
                  ? timing.coachArriveAt
                  : timing.classStartAt;
              const headlineLabel =
                series.deliveryMode === "pickup"
                  ? `leave ${brand.shortName}`
                  : `at ${series.venue.name}`;

              return (
                <li key={session.id}>
                  <Link
                    href={`/coach/classes/${series.seriesId}/sessions/${session.id}`}
                    className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-[var(--surface-strong)] focus:outline-none focus-visible:bg-[var(--surface-strong)]"
                  >
                    <div className="w-24 shrink-0">
                      <div className="tabular font-display text-lg font-medium tracking-tight">
                        {formatTime(headlineTime)}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {headlineLabel}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {series.programName}
                        {series.seriesName && series.seriesName !== series.programName
                          ? ` · ${series.seriesName}`
                          : ""}
                      </div>
                      <div className="tabular text-xs text-[var(--muted-foreground)]">
                        {formatTimingLine(timing, series.deliveryMode)}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {venueLine} · {series.enrolledCount}/{series.maxStudents}{" "}
                        enrolled
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Badge tone={modeTone} variant="soft">
                        {deliveryModeLabel(series.deliveryMode)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section
        title="This week"
        description={formatWeekRange(weekStart)}
        action={
          <Button asChild variant="ghost" size="sm" tone="neutral">
            <Link href="/coach/calendar">Open calendar →</Link>
          </Button>
        }
      >
        {weekSessions.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No teaching this week"
            description="Nothing on your roster Monday through Sunday. Check next week from the calendar."
          />
        ) : (
          <MiniWeekGrid days={weekDays} sessions={weekSessions} />
        )}
      </Section>

      <Section
        title="Today's timeline"
        description={
          todays.length === 0
            ? "Nothing scheduled."
            : `${todays.length} session${todays.length === 1 ? "" : "s"}`
        }
        action={
          <Button asChild variant="ghost" size="sm" tone="neutral">
            <Link href="/coach/bookings">All bookings →</Link>
          </Button>
        }
      >
        {todays.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="Quiet day"
            description="Nothing on the books for today. Add a session if you want to."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/coach/book">
                  {t.bookVerb} a {t.court.singular.toLowerCase()}
                </Link>
              </Button>
            }
          />
        ) : (
          <ol className="relative space-y-1 border-l-2 border-dashed border-[var(--border)] pl-6">
            {todays.map((b) => (
              <li key={b.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[31px] top-3 h-3.5 w-3.5 rounded-full ring-4 ring-[var(--background)]",
                    b.purpose === "coaching"
                      ? "bg-[var(--joint)]"
                      : "bg-[var(--triaz)]",
                  )}
                  aria-hidden
                />
                <div className="flex items-center gap-4 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-[var(--surface)]">
                  <div className="w-20 shrink-0">
                    <div className="tabular font-display text-xl font-medium tracking-tight">
                      {formatTime(b.startsAt)}
                    </div>
                    <div className="tabular text-xs text-[var(--muted-foreground)]">
                      → {formatTime(b.endsAt)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {b.club.name} · {b.court.name}
                    </div>
                    {b.status === "cancellation_requested" && (
                      <div className="text-xs text-[var(--warning-ink)]">
                        Deletion pending
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Badge
                      tone={b.purpose === "coaching" ? "joint" : "triaz"}
                      variant="soft"
                      className="capitalize"
                    >
                      {b.purpose === "coaching"
                        ? t.privateLesson.singular
                        : "Personal"}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        title="Weekly snapshot"
        description={`${formatHours(weekMinutes)} of ${t.privateLesson.plural.toLowerCase()} + ${t.class.plural.toLowerCase()} this week.`}
      >
        <Link
          href="/coach/hours"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-strong)]"
        >
          <ClockIcon size={16} />
          See full hours
          <ArrowRightIcon size={14} />
        </Link>
      </Section>
    </div>
  );
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function formatHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 6) return "Up early";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
