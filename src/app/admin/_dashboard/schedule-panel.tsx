import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentOrg } from "@/lib/tenant";
import {
  adminScheduleHrefPatch,
  currentScheduleWeekStart,
  formatScheduleWeekLabel,
  scheduleClubSlugs,
  shiftScheduleWeek,
  type AdminScheduleFilters,
} from "@/lib/admin/schedule-filters";
import {
  getAdminScheduleWeek,
  countScheduleSessionsMissingCourt,
  listScheduleClassSessions,
} from "@/lib/admin/schedule-queries";
import { listCoachesForAdminFilter } from "@/lib/admin/classes-queries";
import { AdminScheduleGrid } from "@/components/admin/admin-schedule-grid";
import { AdminScheduleClassesCalendar } from "@/components/admin/admin-schedule-classes-calendar";
import { ScheduleFilterBar } from "./schedule-filter-bar";
import { Button } from "@/components/ui/button";

export async function SchedulePanel({
  filters,
}: {
  filters: AdminScheduleFilters;
}) {
  const { person } = await requireAdmin();
  const org = await getCurrentOrg();
  const t = org.terms;

  const clubSlugs = scheduleClubSlugs(filters);
  const weekStart = filters.date;
  const thisWeekMonday = currentScheduleWeekStart();
  const isThisWeek = weekStart === thisWeekMonday;
  const classesOnly = filters.showClasses && !filters.showBookings;

  const [schedule, coachOptions, missingCourtCount, classSessions] =
    await Promise.all([
      classesOnly
        ? Promise.resolve({
            weekStart,
            weekEnd: weekStart,
            days: [],
            sections: [],
          })
        : getAdminScheduleWeek({
            weekStart,
            clubSlugs,
            showClasses: filters.showClasses,
            showBookings: filters.showBookings,
          }),
      listCoachesForAdminFilter(),
      filters.showClasses
        ? countScheduleSessionsMissingCourt({ weekStart, clubSlugs })
        : Promise.resolve(0),
      classesOnly
        ? listScheduleClassSessions({ weekStart, clubSlugs })
        : Promise.resolve([]),
    ]);

  const weekLabel = formatScheduleWeekLabel(weekStart);
  const prevWeek = shiftScheduleWeek(weekStart, -1);
  const nextWeek = shiftScheduleWeek(weekStart, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link
            href={adminScheduleHrefPatch(filters, { date: prevWeek })}
            scroll={false}
          >
            ← Prev week
          </Link>
        </Button>
        {!isThisWeek && (
          <Button asChild variant="outline" size="sm">
            <Link
              href={adminScheduleHrefPatch(filters, { date: thisWeekMonday })}
              scroll={false}
            >
              This week
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link
            href={adminScheduleHrefPatch(filters, { date: nextWeek })}
            scroll={false}
          >
            Next week →
          </Link>
        </Button>
        <span className="ml-2 text-sm font-medium text-[var(--foreground)]">
          {weekLabel}
        </span>
      </div>

      <ScheduleFilterBar
        filters={filters}
        classLabel={t.class.plural}
        bookingLabel="Bookings"
      />

      {missingCourtCount > 0 && (
        <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]">
          {missingCourtCount}{" "}
          {missingCourtCount === 1
            ? `${t.class.singular.toLowerCase()} this week is missing a court and won't appear on the court grid until assigned.`
            : `${t.class.plural.toLowerCase()} this week are missing a court and won't appear on the court grid until assigned.`}{" "}
          <Link
            href="/admin/classes"
            className="font-medium underline underline-offset-2"
          >
            Open {t.class.plural.toLowerCase()}
          </Link>
        </div>
      )}

      {classesOnly ? (
        <AdminScheduleClassesCalendar
          weekStart={weekStart}
          sessions={classSessions}
          clubSlugs={clubSlugs}
        />
      ) : (
        <AdminScheduleGrid
          schedule={schedule}
          viewerPersonId={person.id}
          coachOptions={coachOptions}
        />
      )}
    </div>
  );
}
