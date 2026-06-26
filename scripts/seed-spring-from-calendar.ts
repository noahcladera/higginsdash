/**
 * Seed Spring 2026 class catalog from NL office calendar ICS.
 *
 * Creates ClassSeries + ClassSeriesGroup + coaches + sessions.
 * Run: npm run db:seed-spring-from-calendar
 */

import { PrismaClient } from "@prisma/client";
import { SYSTEM_NO_COACH_PERSON_ID } from "../src/lib/system-ids";
import {
  generateSessionsForSeries,
  toDateKey,
} from "../src/lib/classes/session-dates";
import {
  parseNlCalendar,
  SEASON_SPECS,
  timeToDate,
  minusMinutes,
  type CalendarClassSpec,
} from "./lib/parse-nl-calendar";
import { coachPersonId, upsertCoachRegistry } from "./lib/coach-registry";

const prisma = new PrismaClient();

export async function seedSeasons(): Promise<void> {
  for (const s of SEASON_SPECS) {
    await prisma.season.upsert({
      where: { slug: s.slug },
      create: {
        slug: s.slug,
        name: s.name,
        audience: s.audience,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        defaultExcludedDates: s.defaultExcludedDates,
        isActive: true,
      },
      update: {
        name: s.name,
        audience: s.audience,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        defaultExcludedDates: s.defaultExcludedDates,
        isActive: true,
        archivedAt: null,
      },
    });
  }
}

/**
 * Demo seed: generate every session in the series window.
 *
 * Unlike the admin "regenerate schedule" path (future-only), the demo
 * needs the full season so calendars and enrollment pages can show past
 * weeks crossed out and prorate correctly.
 */
async function seedFullSeasonSessions(args: {
  seriesId: string;
  classType: CalendarClassSpec["classType"];
  startsOn: Date;
  endsOn: Date;
  dayOfWeek: CalendarClassSpec["dayOfWeek"];
  startTime: Date;
  endTime: Date;
  excludedDates: Date[];
}): Promise<{ total: number; past: number; upcoming: number }> {
  const now = new Date();

  await prisma.classSession.deleteMany({
    where: {
      classSeriesId: args.seriesId,
      status: { in: ["scheduled", "completed"] },
    },
  });

  const dates = generateSessionsForSeries(args.classType, {
    startsOn: args.startsOn,
    endsOn: args.endsOn,
    dayOfWeek: args.dayOfWeek,
    startTime: args.startTime,
    endTime: args.endTime,
    excluded: new Set(args.excludedDates.map((d) => toDateKey(d))),
  });

  if (dates.length === 0) return { total: 0, past: 0, upcoming: 0 };

  let past = 0;
  let upcoming = 0;

  await prisma.classSession.createMany({
    data: dates.map((s) => {
      const isPast = s.startsAt < now;
      if (isPast) past++;
      else upcoming++;
      return {
        classSeriesId: args.seriesId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: isPast ? ("completed" as const) : ("scheduled" as const),
      };
    }),
  });

  return { total: dates.length, past, upcoming };
}

export async function seedSpringFromCalendar(): Promise<{
  created: number;
  updated: number;
  total: number;
  sessions: { total: number; past: number; upcoming: number };
}> {
  const specs = parseNlCalendar();
  console.log(`  parsed ${specs.length} canonical class series`);

  const coachMap = await upsertCoachRegistry(prisma);

  const programs = await prisma.program.findMany();
  const seasons = await prisma.season.findMany();
  const venues = await prisma.venue.findMany();
  const schools = await prisma.school.findMany();

  const programBySlug = new Map(programs.map((p) => [p.slug, p]));
  const seasonBySlug = new Map(seasons.map((s) => [s.slug, s]));
  const venueBySlug = new Map(venues.map((v) => [v.slug, v]));
  const schoolBySlug = new Map(schools.map((s) => [s.slug, s]));

  let created = 0;
  let updated = 0;
  let sessionsTotal = 0;
  let sessionsPast = 0;
  let sessionsUpcoming = 0;

  for (const spec of specs) {
    const program = programBySlug.get(spec.programSlug);
    const season = seasonBySlug.get(spec.seasonSlug);
    const venue = venueBySlug.get(spec.venueSlug);
    const school = spec.schoolSlug ? schoolBySlug.get(spec.schoolSlug) : null;

    if (!program || !season || !venue) {
      throw new Error(`Missing refs for "${spec.name}"`);
    }
    if (spec.schoolSlug && !school) {
      throw new Error(`Missing school "${spec.schoolSlug}" for "${spec.name}"`);
    }

    const startTime = timeToDate(spec.startTime.hh, spec.startTime.mm);
    const endTime = timeToDate(spec.endTime.hh, spec.endTime.mm);
    const pickupAt = spec.pickupAt
      ? timeToDate(spec.pickupAt.hh, spec.pickupAt.mm)
      : spec.deliveryMode === "pickup"
        ? minusMinutes(startTime, 30)
        : null;

    const seasonExcluded = season.defaultExcludedDates ?? [];
    const allExcluded = [...seasonExcluded, ...spec.excludedDates];
    const excludedUnique = [
      ...new Map(allExcluded.map((d) => [toDateKey(d), d])).values(),
    ];

    const data = {
      programId: program.id,
      seasonId: season.id,
      name: spec.name,
      classType: spec.classType,
      deliveryMode: spec.deliveryMode,
      venueId: venue.id,
      schoolId: school?.id ?? null,
      dayOfWeek: spec.dayOfWeek,
      startTime,
      endTime,
      pickupAt,
      startsOn: spec.startsOn,
      endsOn: spec.endsOn,
      excludedDates: excludedUnique,
      maxStudents: spec.maxStudents,
      minStudents: spec.minStudents,
      waitlistEnabled: true,
      eligibleSkillLevels: [] as never[],
      minAge: spec.minAge,
      maxAge: spec.maxAge,
      visibility: "public" as const,
      pricePerSeries: spec.pricePerSeries,
      status: "published" as const,
      publicNotes: spec.publicNotes,
      publishedAt: new Date(),
      enrollmentOpensAt: null,
      enrollmentClosesAt: null,
    };

    const existing = await prisma.classSeries.findFirst({
      where: { programId: program.id, name: spec.name },
      select: { id: true },
    });

    let seriesId: string;
    if (existing) {
      await prisma.classSeries.update({ where: { id: existing.id }, data });
      seriesId = existing.id;
      updated++;
    } else {
      const fresh = await prisma.classSeries.create({ data });
      seriesId = fresh.id;
      created++;
    }

    // Default group — required for enrollment
    const existingGroup = await prisma.classSeriesGroup.findFirst({
      where: { classSeriesId: seriesId, archivedAt: null },
      select: { id: true },
    });
    if (existingGroup) {
      await prisma.classSeriesGroup.update({
        where: { id: existingGroup.id },
        data: {
          name: "Main group",
          displayOrder: 0,
          minAge: spec.minAge,
          maxAge: spec.maxAge,
          endTime,
          maxStudents: spec.maxStudents,
          minStudents: spec.minStudents,
        },
      });
    } else {
      await prisma.classSeriesGroup.create({
        data: {
          classSeriesId: seriesId,
          name: "Main group",
          displayOrder: 0,
          minAge: spec.minAge,
          maxAge: spec.maxAge,
          endTime,
          maxStudents: spec.maxStudents,
          minStudents: spec.minStudents,
        },
      });
    }

    // Coaches
    await prisma.classSeriesCoach.deleteMany({
      where: { classSeriesId: seriesId },
    });

    const leadKey = spec.coachKeys[0];
    const leadPersonId = leadKey
      ? (coachMap.get(leadKey) ?? coachPersonId(leadKey))
      : SYSTEM_NO_COACH_PERSON_ID;

    await prisma.classSeriesCoach.create({
      data: {
        classSeriesId: seriesId,
        coachPersonId: leadPersonId,
        role: "lead",
      },
    });

    for (const assistantKey of spec.coachKeys.slice(1, 3)) {
      const assistantId = coachMap.get(assistantKey) ?? coachPersonId(assistantKey);
      await prisma.classSeriesCoach.create({
        data: {
          classSeriesId: seriesId,
          coachPersonId: assistantId,
          role: "assistant",
        },
      });
    }

    const sessionCounts = await seedFullSeasonSessions({
      seriesId,
      classType: spec.classType,
      startsOn: spec.startsOn,
      endsOn: spec.endsOn,
      dayOfWeek: spec.dayOfWeek,
      startTime,
      endTime,
      excludedDates: excludedUnique,
    });
    sessionsTotal += sessionCounts.total;
    sessionsPast += sessionCounts.past;
    sessionsUpcoming += sessionCounts.upcoming;
  }

  return {
    created,
    updated,
    total: specs.length,
    sessions: {
      total: sessionsTotal,
      past: sessionsPast,
      upcoming: sessionsUpcoming,
    },
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed spring catalog in production.");
  }

  console.log("=== Seeding seasons ===");
  await seedSeasons();
  console.log(`  upserted ${SEASON_SPECS.length} seasons`);

  console.log("\n=== Seeding spring classes from calendar ===");
  const result = await seedSpringFromCalendar();
  console.log(
    `  + ${result.created} created, ~ ${result.updated} updated, ${result.total} total, ${result.sessions.total} sessions (${result.sessions.past} past, ${result.sessions.upcoming} upcoming)`,
  );
  console.log("\nSpring calendar seed complete.");
}

const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (entry.endsWith("seed-spring-from-calendar.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
