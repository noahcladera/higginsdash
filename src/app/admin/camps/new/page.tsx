import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
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
      where: { isActive: true, isBookable: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, clubId: true, isBookable: true },
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            <Link
              href="/admin/camps"
              className="hover:text-[var(--foreground)] hover:underline"
            >
              Camps
            </Link>
            {" · New"}
          </p>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            New camp
          </h1>
        </div>
      </div>

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
