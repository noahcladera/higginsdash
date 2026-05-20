import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { createClassSeries } from "../../classes/actions";
import { ClassSeriesForm } from "../../classes/class-series-form";

export default async function NewEventPage() {
  await requireAdmin();

  const [programs, seasons, venues, schools, coachRows] = await Promise.all([
    prisma.program.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, targetAudience: true },
    }),
    prisma.season.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        audience: true,
        startsOn: true,
        endsOn: true,
        defaultExcludedDates: true,
      },
    }),
    prisma.venue.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
    prisma.school.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.coach.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        personId: { not: SYSTEM_NO_COACH_PERSON_ID },
      },
      include: {
        person: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const coaches = coachRows
    .map((c) => ({
      personId: c.personId,
      name: [c.person.firstName, c.person.lastName].filter(Boolean).join(" "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Map Prisma Date columns to ISO `YYYY-MM-DD` strings so the
  // client-only Schedule step can autofill the `<DateField>`s.
  const seasonOptions = seasons.map((s) => ({
    id: s.id,
    name: s.name,
    audience: s.audience,
    startsOn: s.startsOn ? dateToISO(s.startsOn) : "",
    endsOn: s.endsOn ? dateToISO(s.endsOn) : "",
    defaultExcludedDates: s.defaultExcludedDates.map((d) => dateToISO(d)),
  }));

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { label: "Events", href: "/admin/events" },
          { label: "New" },
        ]}
      />
      <PageHeader
        kicker="Admin · Events"
        title="New event"
        description="Events use the same scheduling engine as classes. Pick the dates and times, attach a venue, and the same enrollment + payment flow applies."
      />
      <ClassSeriesForm
        action={createClassSeries}
        submitLabel="Create event"
        kind="event"
        programs={programs}
        seasons={seasonOptions}
        venues={venues}
        schools={schools}
        coaches={coaches}
      />
    </div>
  );
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
