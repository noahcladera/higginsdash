import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
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
  TicketIcon,
  UsersIcon,
  InboxIcon,
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
import { getCurrentBrand, getCurrentOrg, getTerms } from "@/lib/tenant";
import {
  daysOfWeek,
  formatWeekRange,
  mondayOfWeekUtc,
  resolveWeekStart,
  shiftWeeks,
  weekParamOf,
} from "@/lib/calendar/week";
import { MiniWeekGrid } from "./_components/mini-week-grid";
import { MobileGroupedMetrics } from "@/app/portal/_components/mobile-grouped-metrics";
import { MobileQuickActions } from "@/app/portal/_components/mobile-quick-actions";
import {
  NextUpCard,
  type NextUpItem,
} from "@/app/portal/_components/next-up-card";
import { CalendarPagerTransition } from "@/app/portal/_components/calendar-pager-transition";
import { CoachPendingBanner } from "./_components/coach-pending-banner";
import {
  CoachTodaySchedule,
  CoachTodayTimelineDesktop,
  type CoachScheduleItem,
} from "./_components/coach-today-schedule";
import { CoachWeekPager } from "./_components/coach-week-pager";

/**
 * Coach landing page — mobile-native grouped dashboard + desktop timeline.
 */
export default async function CoachHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { person, allowedClubIds } = await requireCoach();
  const [t, brand, org] = await Promise.all([
    getTerms(),
    getCurrentBrand(),
    getCurrentOrg(),
  ]);
  const f = org.features;
  const bookingClub = courtBookingClubFilter(allowedClubIds);
  const sp = (await searchParams) ?? {};

  const today = formatLocalDate(new Date());
  const todayParts = parseLocalDate(today);
  const todayStartUtc = amsterdamMidnightUtc(
    todayParts.year,
    todayParts.month,
    todayParts.day,
  );
  const todayEndUtc = addDays(todayStartUtc, 1);
  const weekStart = resolveWeekStart(
    typeof sp.week === "string" ? sp.week : undefined,
  );
  const thisWeekStart = mondayOfWeekUtc(new Date());
  const isThisWeek = weekStart.getTime() === thisWeekStart.getTime();
  const prevParam = weekParamOf(shiftWeeks(weekStart, -1));
  const nextParam = weekParamOf(shiftWeeks(weekStart, 1));
  const thisWeekParam = weekParamOf(thisWeekStart);

  const [todays, pendingMine, todaysClasses, weekEvents] = await Promise.all([
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

  const onTodayCount = todays.length + todaysClassRows.length;

  const courtMinutesToday = todays.reduce(
    (acc, b) => acc + minutesBetween(b.startsAt, b.endsAt),
    0,
  );
  const classMinutesToday = todaysClassRows.reduce(
    (acc, { session }) =>
      acc + minutesBetween(session.startsAt, session.endsAt),
    0,
  );
  const totalMinutesToday = courtMinutesToday + classMinutesToday;

  const coachingCourtMinutesToday = todays
    .filter((b) => b.purpose === "coaching")
    .reduce((acc, b) => acc + minutesBetween(b.startsAt, b.endsAt), 0);
  const coachingMinutesToday = coachingCourtMinutesToday + classMinutesToday;

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

  const scheduleItems: CoachScheduleItem[] = [
    ...todaysClassRows.map(({ series, session }) => {
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
      const headlineTime =
        series.deliveryMode === "pickup" && timing.coachArriveAt
          ? timing.coachArriveAt
          : timing.classStartAt;
      return {
        id: `class-${session.id}`,
        kind: "class" as const,
        startsAt: headlineTime,
        endsAt: session.endsAt,
        href: `/coach/classes/${series.seriesId}/sessions/${session.id}`,
        title: series.programName,
        subtitle: `${formatTimingLine(timing, series.deliveryMode)} · ${series.venue.name}`,
        badge: {
          label: deliveryModeLabel(series.deliveryMode),
          tone: modeTone as "triaz" | "joint" | "warning" | "neutral",
        },
      };
    }),
    ...todays.map((b) => ({
      id: `booking-${b.id}`,
      kind: "booking" as const,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      href: "/coach/bookings",
      title: `${b.club.name} · ${b.court.name}`,
      subtitle:
        b.purpose === "coaching"
          ? t.privateLesson.singular
          : "Personal court time",
      badge: {
        label:
          b.purpose === "coaching" ? t.privateLesson.singular : "Personal",
        tone: (b.purpose === "coaching" ? "joint" : "triaz") as
          | "triaz"
          | "joint",
      },
      warning:
        b.status === "cancellation_requested" ? "Deletion pending" : undefined,
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const nextUp: NextUpItem | null =
    scheduleItems.length > 0
      ? {
          kind:
            scheduleItems[0]!.kind === "class"
              ? "session"
              : "booking",
          startsAt: scheduleItems[0]!.startsAt,
          endsAt: scheduleItems[0]!.endsAt,
          title: scheduleItems[0]!.title,
          subtitle: scheduleItems[0]!.subtitle,
          href: scheduleItems[0]!.href,
        }
      : null;

  const quickActions = [
    ...(f.coachPrivateLessonInvoicing || f.courtBookings
      ? [
          {
            href: "/coach/book",
            label: `${t.bookVerb} ${t.court.singular.toLowerCase()}`,
            icon: <CalendarIcon size={18} />,
            emphasis: true,
          },
        ]
      : []),
    {
      href: "/coach/calendar",
      label: "Open calendar",
      icon: <CalendarIcon size={18} />,
    },
    ...(f.courtBookings
      ? [
          {
            href: "/coach/bookings",
            label: "My bookings",
            icon: <TicketIcon size={18} />,
          },
        ]
      : []),
    ...(f.inbox
      ? [
          {
            href: "/coach/inbox",
            label: "Inbox",
            icon: <InboxIcon size={18} />,
          },
        ]
      : []),
    ...(f.classes
      ? [
          {
            href: "/coach/classes",
            label: `My ${t.class.plural.toLowerCase()}`,
            icon: <UsersIcon size={18} />,
          },
        ]
      : []),
    ...(f.coachPrivateLessonInvoicing
      ? [
          {
            href: "/coach/hours",
            label: "My hours",
            icon: <ClockIcon size={18} />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-10">
      <ShellPageHeader
        kicker={t.coach.role}
        title={greeting}
        description={subtitle}
        actions={
          (f.coachPrivateLessonInvoicing || f.courtBookings) && (
            <Button asChild tone="triaz">
              <Link href="/coach/book">
                <PlusIcon /> {t.bookVerb} a {t.court.singular.toLowerCase()}
              </Link>
            </Button>
          )
        }
      />

      <CoachPendingBanner count={pendingMine} />

      {nextUp && <NextUpCard item={nextUp} />}

      <MobileGroupedMetrics
        items={[
          {
            label: "On today",
            value: onTodayCount || "—",
            hint:
              onTodayCount === 0
                ? "Nothing scheduled"
                : `${formatHours(totalMinutesToday)} on ${t.court.singular.toLowerCase()}`,
          },
          {
            label: `${t.privateLesson.plural}`,
            value:
              coachingMinutesToday > 0
                ? formatHours(coachingMinutesToday)
                : "—",
            hint:
              coachingMinutesToday === 0
                ? `No ${t.privateLesson.plural.toLowerCase()} or ${t.class.plural.toLowerCase()}`
                : "billable today",
          },
          {
            label: "This week",
            value: formatHours(weekMinutes),
            hint: "Mon–Sun teaching",
          },
          {
            label: "Pending",
            value: pendingMine || "—",
            hint: pendingMine ? "deletion requests" : "all clear",
          },
        ]}
      />

      <MobileQuickActions items={quickActions} header="Quick actions" />

      <CoachTodaySchedule
        items={scheduleItems}
        bookLabel={t.bookVerb}
        courtSingular={t.court.singular.toLowerCase()}
      />

      <MetricStrip className="hidden lg:flex">
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
          className="hidden lg:block"
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
                        {series.seriesName &&
                        series.seriesName !== series.programName
                          ? ` · ${series.seriesName}`
                          : ""}
                      </div>
                      <div className="tabular text-xs text-[var(--muted-foreground)]">
                        {formatTimingLine(timing, series.deliveryMode)}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {venueLine} · {series.enrolledCount}/
                        {series.maxStudents} enrolled
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
        <CoachWeekPager
          className="mb-4 lg:hidden"
          label={formatWeekRange(weekStart)}
          prevHref={`/coach?week=${prevParam}`}
          nextHref={`/coach?week=${nextParam}`}
          thisWeekHref={`/coach?week=${thisWeekParam}`}
          isThisWeek={isThisWeek}
        />
        <CalendarPagerTransition pagerKey={weekParamOf(weekStart)} compareKind="lex">
          {weekSessions.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon size={20} />}
              title="No teaching this week"
              description="Nothing on your roster Monday through Sunday."
            />
          ) : (
            <MiniWeekGrid days={weekDays} sessions={weekSessions} />
          )}
        </CalendarPagerTransition>
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
        className="hidden lg:block"
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
          <CoachTodayTimelineDesktop
            bookings={todays.map((b) => ({
              id: b.id,
              startsAt: b.startsAt,
              endsAt: b.endsAt,
              clubName: b.club.name,
              courtName: b.court.name,
              purpose: b.purpose,
              status: b.status,
            }))}
            privateLessonSingular={t.privateLesson.singular}
          />
        )}
      </Section>

      <Section
        title="Weekly snapshot"
        description={`${formatHours(weekMinutes)} of ${t.privateLesson.plural.toLowerCase()} + ${t.class.plural.toLowerCase()} this week.`}
        className="hidden lg:block"
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
