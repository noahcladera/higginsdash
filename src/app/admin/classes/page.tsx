import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import {
  parseAdminClassesFilters,
  resolveCalendarAnchor,
  calendarRangeEnd,
  formatAdminCalendarRangeLabel,
} from "@/lib/admin/classes-filters";
import {
  countSessionsInCalendarRange,
  listClubsForAdminFilter,
  listCoachesForAdminFilter,
  listSchoolsForAdminFilter,
  listSeriesForAdmin,
} from "@/lib/admin/classes-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";
import { AdminClassesFilterBar } from "./_components/filter-bar";
import { AdminClassesViewTabs } from "./_components/view-tabs";
import { AdminCalendarView } from "./_components/calendar-view";
import { AdminClassesListView } from "./_components/list-view";
import type { ClassRowData } from "./_components/class-row";

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getTerms();
  const sp = await searchParams;
  const filters = parseAdminClassesFilters(sp);

  const [
    series,
    clubs,
    coaches,
    schools,
    sessionCountInWindow,
  ] = await Promise.all([
    filters.view === "list"
      ? listSeriesForAdmin(filters)
      : Promise.resolve([]),
    listClubsForAdminFilter(),
    listCoachesForAdminFilter(),
    listSchoolsForAdminFilter(),
    filters.view === "list"
      ? (async () => {
          const rangeStart = resolveCalendarAnchor(filters.fromISO);
          const rangeEnd = calendarRangeEnd(rangeStart, filters.span);
          return countSessionsInCalendarRange(filters, rangeStart, rangeEnd);
        })()
      : Promise.resolve(0),
  ]);

  const rows: ClassRowData[] = series.map((s) => {
    const leadRow = s.coaches.find((c) => c.role === "lead");
    const assistantRows = s.coaches.filter((c) => c.role === "assistant");

    const coachName = (c: (typeof s.coaches)[0]) => {
      if (c.coach.personId === SYSTEM_NO_COACH_PERSON_ID) return "NO COACH YET";
      return (
        [c.coach.person.firstName, c.coach.person.lastName]
          .filter(Boolean)
          .join(" ") || "—"
      );
    };

    const leadCoachName = leadRow ? coachName(leadRow) : "NO COACH YET";
    const assistantCoachNames = assistantRows.map(coachName);
    const realCoaches = [leadCoachName, ...assistantCoachNames].filter(
      (n) => n !== "NO COACH YET",
    );

    return {
      id: s.id,
      name: s.name,
      programName: s.program.name,
      seasonName: s.season?.name ?? null,
      deliveryMode: s.deliveryMode,
      venueName: s.venue.name,
      schoolName: s.school?.name ?? null,
      dayOfWeek: s.dayOfWeek ?? "mon",
      startTimeHHMM: timeToHHMM(s.startTime),
      endTimeHHMM: timeToHHMM(s.endTime),
      pickupAtHHMM: s.pickupAt ? timeToHHMM(s.pickupAt) : null,
      startsOnISO: dateToISO(s.startsOn),
      endsOnISO: dateToISO(s.endsOn),
      excludedDatesISO: s.excludedDates.map(dateToISO),
      leadCoachName,
      assistantCoachNames,
      allCoachNames: realCoaches,
      enrolled: s._count.enrollments,
      maxStudents: s.maxStudents,
      minStudents: s.minStudents ?? null,
      sessionsTotal: s._count.sessions,
      status: s.status,
    };
  });

  const windowLabel = formatAdminCalendarRangeLabel(
    filters.fromISO,
    filters.span,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title={t.class.plural}
        description={`${t.season.singular} ops dashboard — filter by audience and format, then scan the calendar or list. Click a session block for a quick summary.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/classes/new">
              <PlusIcon /> New {t.class.singular.toLowerCase()}
            </Link>
          </Button>
        }
      />

      <AdminClassesFilterBar
        filters={filters}
        clubs={clubs}
        coaches={coaches}
        schools={schools}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminClassesViewTabs filters={filters} />
      </div>

      {filters.view === "calendar" ? (
        <AdminCalendarView filters={filters} />
      ) : (
        <AdminClassesListView
          rows={rows}
          q={filters.q}
          sessionCountInWindow={sessionCountInWindow}
          windowLabel={windowLabel}
        />
      )}
    </div>
  );
}

function timeToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
