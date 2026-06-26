import type { AdminCalendarSession } from "@/lib/admin/classes-queries";
import { weekDaysFromStart } from "@/lib/admin/schedule-queries";
import { SessionsGrid } from "@/app/admin/classes/_components/sessions-grid";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import { ScheduleClassesLegend } from "@/components/admin/schedule-classes-legend";

function scheduleClassFilters(weekStart: string): AdminClassesFilters {
  return {
    view: "calendar",
    audience: "all",
    delivery: null,
    schoolSlug: null,
    clubId: null,
    coachPersonId: null,
    dayOfWeek: null,
    programSlug: null,
    seasonId: null,
    seriesId: null,
    groupBy: "flat",
    seriesStatus: "all",
    includeAllSeries: true,
    q: "",
    fromISO: weekStart,
    span: 7,
  };
}

export function AdminScheduleClassesCalendar({
  weekStart,
  sessions,
  clubSlugs,
}: {
  weekStart: string;
  sessions: AdminCalendarSession[];
  clubSlugs: ("triaz" | "randwijck")[];
}) {
  if (clubSlugs.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        Select at least one club to show classes.
      </p>
    );
  }

  const days = weekDaysFromStart(weekStart);

  return (
    <div className="space-y-3">
      <SessionsGrid
        days={days}
        sessions={sessions}
        filters={scheduleClassFilters(weekStart)}
        colorMode="venue"
        blockAnchor="class"
        expandToday
        overflowMode="preview"
        clubOutlines
      />
      <ScheduleClassesLegend />
    </div>
  );
}
