import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { createClassSeries } from "../../classes/actions";
import { ClassSeriesForm } from "../../classes/class-series-form";

export default async function NewCampPage() {
  await requireAdmin();

  const [programs, seasons, venues, schools, courts, coachRows] = await Promise.all([
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
      select: { id: true, name: true, kind: true, clubId: true },
    }),
    prisma.school.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.court.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, clubId: true },
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

  const seasonOptions = seasons
    .filter((s) => s.audience === "youth")
    .map((s) => ({
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
        items={[{ label: "Camps", href: "/admin/camps" }, { label: "New" }]}
      />
      <PageHeader
        kicker="Admin · Camps"
        title="New camp"
        description="One kids camp week at a time — Mon–Fri by default, daily times, optional days off. Parents book the full week or single drop-in days."
      />
      <ClassSeriesForm
        action={createClassSeries}
        submitLabel="Create camp"
        kind="camp"
        programs={programs}
        seasons={seasonOptions}
        venues={venues}
        schools={schools}
        courts={courts}
        coaches={coaches}
      />
    </div>
  );
}

function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
