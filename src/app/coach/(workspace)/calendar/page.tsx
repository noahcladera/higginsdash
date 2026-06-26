import Link from "next/link";
import { headers } from "next/headers";
import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon } from "@/components/icons";
import { AddToCalendarDialog } from "@/components/calendar/add-to-calendar-dialog";
import { getCoachCalendarEvents } from "@/lib/coach/calendar-queries";
import {
  daysOfWeek,
  formatWeekRange,
  mondayOfWeekUtc,
  resolveWeekStart,
  shiftWeeks,
  weekParamOf,
} from "@/lib/calendar/week";
import { WeekGrid } from "./_components/week-grid";
import { getTerms } from "@/lib/tenant";

/**
 * Coach calendar — week view of the signed-in coach's own sessions.
 * Pickup classes show the full leave → pickup → class → end block so
 * hours-on-the-clock are visually obvious; at-club / onsite classes
 * show a single class block (coach arrival = class start).
 *
 * ?week=YYYY-MM-DD snaps to that date's Monday; defaults to this week.
 */
export default async function CoachCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { person, allowedClubIds } = await requireCoach();
  const terms = await getTerms();
  const sp = await searchParams;
  const weekStart = resolveWeekStart(sp.week);
  const days = daysOfWeek(weekStart);
  const [events, calendarTokens] = await Promise.all([
    getCoachCalendarEvents(person.id, weekStart, {
      allowedClubIds,
    }),
    prisma.calendarFeedToken.findMany({
      where: { personId: person.id, revokedAt: null },
      select: { id: true, scope: true },
    }),
  ]);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;
  const sessionCount = events.filter((e) => e.kind === "session").length;
  const bookingCount = events.filter((e) => e.kind === "booking").length;

  const today = mondayOfWeekUtc(new Date());
  const isThisWeek = weekStart.getTime() === today.getTime();

  const prevParam = weekParamOf(shiftWeeks(weekStart, -1));
  const nextParam = weekParamOf(shiftWeeks(weekStart, 1));
  const thisWeekParam = weekParamOf(today);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={terms.coach.role}
        title="My calendar"
        description="Every session with your name on it this week. Pickup-mode sessions show the full leave-base to session-end block so you can see your on-the-clock hours at a glance."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AddToCalendarDialog
              origin={origin}
              hasHousehold={false}
              allowedScopes={["coach"]}
              defaultScope="coach"
              initialTokens={calendarTokens}
              variant="coach"
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/coach/calendar?week=${prevParam}`}>← Prev</Link>
            </Button>
            {!isThisWeek && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/coach/calendar?week=${thisWeekParam}`}>
                  This week
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/coach/calendar?week=${nextParam}`}>Next →</Link>
            </Button>
          </div>
        }
      />

      <Section
        title={formatWeekRange(weekStart)}
        description={
          events.length === 0
            ? "Nothing scheduled this week."
            : [
                sessionCount > 0
                  ? `${sessionCount} session${sessionCount === 1 ? "" : "s"}`
                  : null,
                bookingCount > 0
                  ? `${bookingCount} booking${bookingCount === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
      >
        {events.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="Clear week"
            description="No classes or bookings on the roster. Check next week or your hours log."
          />
        ) : (
          <WeekGrid days={days} events={events} terms={terms} />
        )}
      </Section>
    </div>
  );
}
