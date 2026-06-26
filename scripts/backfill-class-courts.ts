/**
 * Assign bookable courts to all club-venue class series using overlap-aware
 * greedy packing, then sync session.courtId for the admin schedule grid.
 *
 * Adults: ~6 students per court (weight). Kids: ~8 per court. Coach count
 * also raises priority. One court per series (schema limit).
 *
 * Run:
 *   npm run db:backfill-class-courts           # dry-run
 *   npm run db:backfill-class-courts -- --confirm
 */
import { PrismaClient, type DayOfWeek, type ProgramTargetAudience } from "@prisma/client";

const prisma = new PrismaClient();

type CourtRow = { id: string; name: string; clubId: string; displayOrder: number };

type SeriesRow = {
  id: string;
  name: string;
  dayOfWeek: DayOfWeek;
  startTime: Date;
  endTime: Date;
  maxStudents: number;
  clubId: string;
  clubName: string;
  audience: ProgramTargetAudience;
  coachCount: number;
};

type Assignment = {
  seriesId: string;
  seriesName: string;
  clubName: string;
  courtId: string;
  courtName: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  weight: number;
};

function parseArgs() {
  return { confirm: process.argv.includes("--confirm") };
}

function timeToMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function formatTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function courtWeight(audience: ProgramTargetAudience, maxStudents: number, coachCount: number): number {
  const perCourt = audience === "adults" ? 6 : 8;
  const byStudents = Math.ceil(maxStudents / perCourt);
  const byCoaches = coachCount;
  return Math.max(1, byStudents, byCoaches);
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export async function backfillClassCourts(
  db: PrismaClient,
  opts: { confirm: boolean },
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const courts = await db.court.findMany({
    where: { isActive: true, isBookable: true },
    orderBy: [{ clubId: "asc" }, { displayOrder: "asc" }],
    select: { id: true, name: true, clubId: true, displayOrder: true },
  });

  const courtsByClub = new Map<string, CourtRow[]>();
  for (const c of courts) {
    const list = courtsByClub.get(c.clubId);
    if (list) list.push(c);
    else courtsByClub.set(c.clubId, [c]);
  }

  const rawSeries = await db.classSeries.findMany({
    where: {
      status: { not: "cancelled" },
      venue: { kind: "club", clubId: { not: null } },
      dayOfWeek: { not: null },
    },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      maxStudents: true,
      venue: {
        select: {
          clubId: true,
          club: { select: { name: true } },
        },
      },
      program: { select: { targetAudience: true } },
      coaches: {
        where: {
          role: { in: ["lead", "assistant"] },
          coach: { archivedAt: null },
        },
        select: { role: true },
      },
    },
  });

  const seriesRows: SeriesRow[] = rawSeries
    .filter((s) => s.venue.clubId != null && s.dayOfWeek != null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      dayOfWeek: s.dayOfWeek!,
      startTime: s.startTime,
      endTime: s.endTime,
      maxStudents: s.maxStudents,
      clubId: s.venue.clubId!,
      clubName: s.venue.club?.name ?? "Club",
      audience: s.program.targetAudience,
      coachCount: s.coaches.length,
    }));

  const byClub = new Map<string, SeriesRow[]>();
  for (const s of seriesRows) {
    const list = byClub.get(s.clubId);
    if (list) list.push(s);
    else byClub.set(s.clubId, [s]);
  }

  const assignments: Assignment[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const [clubId, clubSeries] of byClub) {
    const clubCourts = courtsByClub.get(clubId) ?? [];
    if (clubCourts.length === 0) {
      warnings.push(`No bookable courts for club ${clubSeries[0]?.clubName ?? clubId} (${clubSeries.length} series skipped)`);
      skipped += clubSeries.length;
      continue;
    }

    const sorted = [...clubSeries].sort((a, b) => {
      const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (startDiff !== 0) return startDiff;
      const weightDiff =
        courtWeight(b.audience, b.maxStudents, b.coachCount) -
        courtWeight(a.audience, a.maxStudents, a.coachCount);
      if (weightDiff !== 0) return weightDiff;
      return a.name.localeCompare(b.name);
    });

    const placed: Assignment[] = [];

    for (const s of sorted) {
      const startMin = timeToMinutes(s.startTime);
      const endMin = timeToMinutes(s.endTime);
      const weight = courtWeight(s.audience, s.maxStudents, s.coachCount);

      let chosen: CourtRow | null = null;
      for (const court of clubCourts) {
        const conflict = placed.some(
          (p) =>
            p.courtId === court.id &&
            p.dayOfWeek === s.dayOfWeek &&
            intervalsOverlap(startMin, endMin, p.startMin, p.endMin),
        );
        if (!conflict) {
          chosen = court;
          break;
        }
      }

      if (!chosen) {
        skipped += 1;
        warnings.push(
          `${s.clubName} · ${DAY_LABEL[s.dayOfWeek]} ${formatTime(s.startTime)}–${formatTime(s.endTime)} · ${s.name}: no free court`,
        );
        continue;
      }

      const assignment: Assignment = {
        seriesId: s.id,
        seriesName: s.name,
        clubName: s.clubName,
        courtId: chosen.id,
        courtName: chosen.name,
        dayOfWeek: s.dayOfWeek,
        startMin,
        endMin,
        weight,
      };
      placed.push(assignment);
      assignments.push(assignment);
    }
  }

  if (!opts.confirm) {
    console.log(`Dry run — ${assignments.length} series would be assigned, ${skipped} skipped.\n`);
    for (const a of assignments.slice(0, 40)) {
      console.log(
        `  ${a.clubName} · ${DAY_LABEL[a.dayOfWeek]} ${formatTimeMinutes(a.startMin)} → ${a.courtName} · ${a.seriesName} (weight ${a.weight})`,
      );
    }
    if (assignments.length > 40) {
      console.log(`  … and ${assignments.length - 40} more`);
    }
    if (warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of warnings) console.log(`  ⚠ ${w}`);
    }
    console.log("\nRe-run with --confirm to write.");
    return { assigned: assignments.length, skipped, warnings };
  }

  let assigned = 0;
  for (const a of assignments) {
    const series = rawSeries.find((s) => s.id === a.seriesId);
    if (!series) continue;

    await db.classSeries.update({
      where: { id: a.seriesId },
      data: {
        defaultCourtId: a.courtId,
        courtBlockStartTime: series.startTime,
        courtBlockEndTime: series.endTime,
      },
    });

    await db.classSession.updateMany({
      where: { classSeriesId: a.seriesId, status: { not: "cancelled" } },
      data: { courtId: a.courtId },
    });

    assigned += 1;
  }

  console.log(`Assigned courts to ${assigned} series, skipped ${skipped}.`);
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  return { assigned, skipped, warnings };
}

function formatTimeMinutes(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

async function main() {
  const { confirm } = parseArgs();
  await backfillClassCourts(prisma, { confirm });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
