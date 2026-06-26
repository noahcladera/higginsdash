import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { parseAdminClassesFilters } from "@/lib/admin/classes-filters";
import { listSeriesForAdmin } from "@/lib/admin/classes-queries";
import { filtersForClassTree } from "@/lib/admin/classes-href";
import { Button } from "@/components/ui/button";
import { PlusIcon, CalendarIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";
import { ClassFilterBar } from "./_components/class-filter-bar";
import { AdminClassesListView } from "./_components/list-view";
import type { ClassRowData } from "./_components/class-row";
import { formatLocalDate } from "@/lib/booking/time";

export default async function AdminClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getTerms();
  const sp = await searchParams;
  const filters = parseAdminClassesFilters(sp);
  const treeFilters = filtersForClassTree(filters);

  const [treeSeries, filteredSeries] = await Promise.all([
    listSeriesForAdmin(treeFilters),
    listSeriesForAdmin(filters),
  ]);

  const treeRows = treeSeries.map(mapSeriesToRow);
  const rows = filteredSeries.map(mapSeriesToRow);
  const today = formatLocalDate(new Date());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {t.class.plural}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" tone="neutral" size="sm">
            <Link href={`/admin?panel=schedule&date=${today}`}>
              <CalendarIcon size={14} /> Court schedule
            </Link>
          </Button>
          <Button asChild tone="triaz" size="sm">
            <Link href="/admin/classes/new">
              <PlusIcon size={14} /> New {t.class.singular.toLowerCase()}
            </Link>
          </Button>
        </div>
      </div>

      <ClassFilterBar filters={filters} treeRows={treeRows} />

      <AdminClassesListView rows={rows} q={filters.q} />
    </div>
  );
}

function mapSeriesToRow(s: Awaited<ReturnType<typeof listSeriesForAdmin>>[0]): ClassRowData {
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
  const realCoaches = [
    ...new Set(
      [leadCoachName, ...assistantCoachNames].filter(
        (n) => n !== "NO COACH YET",
      ),
    ),
  ];

  const venueLabel =
    s.deliveryMode === "pickup" && s.school?.name
      ? `${s.school.name} → ${s.venue.name}`
      : s.venue.name;

  return {
    id: s.id,
    name: s.name,
    programName: s.program.name,
    programSlug: s.program.slug,
    programTargetAudience: s.program.targetAudience,
    seasonName: s.season?.name ?? null,
    seasonId: s.season?.id ?? null,
    displayTitle: buildClassDisplayTitle(
      s.dayOfWeek ?? "mon",
      timeToHHMM(s.startTime),
      timeToHHMM(s.endTime),
      venueLabel,
    ),
    displaySubtitle: s.program.name,
    deliveryMode: s.deliveryMode,
    venueName: s.venue.name,
    venueKind: s.venue.kind,
    defaultCourtId: s.defaultCourtId,
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
}

function timeToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildClassDisplayTitle(
  dayOfWeek: string,
  start: string,
  end: string,
  venue: string,
): string {
  const day = dayOfWeek.slice(0, 3).toUpperCase();
  return `${day} ${start}–${end} · ${venue}`;
}
