/**
 * Seed the parent-portal catalog with ~28 GoTimmy-shaped class series.
 *
 * Source data: every series name below is taken verbatim (or near-
 * verbatim) from `Registration_Report (1).xls` — the GoTimmy export of
 * Higgins' real catalog. The names are kept in their messy original
 * form on purpose so admins recognize them when migrating; cleanup can
 * happen later via the admin editor.
 *
 * Replaces the earlier `seed-stub-catalog.ts` (which inserted 5 STUB
 * rows). On every run we:
 *
 *   1. Drop any leftover `STUB ·`-prefixed series so they don't pollute
 *      the catalog.
 *   2. Backfill placeholder Tier-2 holiday dates onto the active
 *      seasons (only when blank — never clobbers admin edits).
 *   3. Upsert ~28 series by `(programId, name)`. Re-runs are no-ops.
 *
 * Sessions ARE generated here using the same `generateSessionDates`
 * helper the admin "save & regenerate" flow uses, so the seeded
 * catalog has a real schedule out of the box (the parent calendar /
 * coach calendar both look empty otherwise). On re-run we delete the
 * scheduled future sessions and re-emit them, which keeps the seed
 * idempotent without touching past or completed/cancelled sessions
 * that admins might have edited.
 *
 * Coaches default to the synthetic "NO COACH YET" placeholder. Admins
 * swap in real leads via /admin/classes/[id].
 *
 * Run: `npm run db:seed-real-catalog`
 *
 * Pre-reqs: `npm run db:seed` (programs, schools, venues, seasons,
 * placeholder coach).
 */

import { PrismaClient } from "@prisma/client";
import { SYSTEM_NO_COACH_PERSON_ID } from "../src/lib/system-ids";
import {
  generateSessionDates,
  toDateKey,
} from "../src/lib/classes/session-dates";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Tiny helpers — keep all the date / time fiddling in one place so the
// series specs read like the GoTimmy strings they came from.
// ---------------------------------------------------------------------------

/** A time-of-day stored on a Prisma `@db.Time` column (anchored 1970-01-01 UTC). */
function t(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

/** Subtract `minutes` from a time-of-day Date (kept inside 1970-01-01 UTC). */
function minus(time: Date, minutes: number): Date {
  return new Date(time.getTime() - minutes * 60_000);
}

/** A calendar date stored on a `@db.Date` column (UTC midnight). */
function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type ClassType =
  | "group_lesson"
  | "high_performance"
  | "school_pickup"
  | "school_onsite"
  | "private_individual"
  | "private_small_group"
  | "camp"
  | "trial"
  | "event";
type Delivery = "at_club" | "onsite" | "pickup";

interface SeriesSpec {
  /** GoTimmy name, kept verbatim. */
  name: string;
  programSlug: "adult-group" | "kids-group" | "high-performance" | "school-programs";
  seasonSlug: string;
  classType: ClassType;
  deliveryMode: Delivery;
  venueSlug: "triaz" | "randwijck";
  /** Set for any school-pickup series — slug must match `seedSchools()`. */
  schoolSlug?: "aics" | "bsa" | "amity" | "ifs" | "kindercampus";
  dayOfWeek: Day;
  startTime: Date;
  endTime: Date;
  /** Pickup time (school gate) — defaults to startTime - 30min for pickups. */
  pickupAt?: Date;
  startsOn: Date;
  endsOn: Date;
  minAge: number;
  maxAge: number;
  maxStudents: number;
  minStudents?: number;
  pricePerSeries: string;
  publicNotes: string;
}

// ---------------------------------------------------------------------------
// Season windows used below. Today is April 2026, so the Spring 2 batch
// is "in flight" (catalog endsOn-filter passes) and the Fall 1 batch is
// "upcoming." Spring 1 series are skipped because most of them already
// ended in March.
// ---------------------------------------------------------------------------

// Spring 2 2026 — 12-week run, Apr 6 → Jun 28 (adjust per day-of-week).
const SPRING2 = {
  slug: "spring-2-2026",
  // Pick day-specific windows so a Mon series doesn't startOn a Saturday.
  // The session generator will skip non-matching weekdays anyway, but
  // keeping the boundary aligned looks tidier in admin.
  startsOn: d(2026, 4, 6),
  endsOn: d(2026, 6, 28),
};

// Fall 1 2026 — 8-week run, Aug 31 → Oct 25.
const FALL1 = {
  slug: "fall-1-2026",
  startsOn: d(2026, 8, 31),
  endsOn: d(2026, 10, 25),
};

// ---------------------------------------------------------------------------
// The catalog. Adding a row? Copy a similar one and edit the name + the
// 5 fields that vary (day, time, age band, venue, school). Everything
// else has a sensible default.
// ---------------------------------------------------------------------------

const SERIES: SeriesSpec[] = [
  // ----- Spring 2 2026 · Adult group --------------------------------------
  {
    name: "Spring 1 Mon 7:30-9:00PM Intermediate to Advanced Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "mon",
    startTime: t(19, 30),
    endTime: t(21, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "272.00",
    publicNotes:
      "Strong rallying players working on consistency, depth and tactical play. Match-play in the second half of every session.",
  },
  {
    name: "Spring 1 Tue 6:30-8:00PM Beginner to Intermediate Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "tue",
    startTime: t(18, 30),
    endTime: t(20, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "238.00",
    publicNotes:
      "Mixed-level group: starts with the basics (grip, swing, scoring) and works up to point-play. Good for first-timers and returning players.",
  },
  {
    name: "Spring 1 Wed 10:00-11:30AM Adv. Beginner to Low Intermediate Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(10, 0),
    endTime: t(11, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "238.00",
    publicNotes:
      "Daytime adult group at Triaz. Comfortable rallying back-and-forth and ready to start playing real points.",
  },
  {
    name: "Spring 1 Wed 6:30-8:00PM Beginner to Intermediate Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(18, 30),
    endTime: t(20, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "238.00",
    publicNotes:
      "Evening mixed group. Coach splits the court so beginners drill basics while improvers play points alongside.",
  },
  {
    name: "Spring 1 Thur 6:30-8:00PM Beginner to Adv. Beginner Randwijck 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "randwijck",
    dayOfWeek: "thu",
    startTime: t(18, 30),
    endTime: t(20, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "238.00",
    publicNotes:
      "Adult beginners group on the Randwijck clay. Forgiving surface that's easy on the knees while you're learning.",
  },
  {
    name: "Spring 1 Fri 10:00-11:30AM Low Intermediate to Intermediate Randwijck 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "randwijck",
    dayOfWeek: "fri",
    startTime: t(10, 0),
    endTime: t(11, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "272.00",
    publicNotes:
      "Mid-morning at Randwijck, ideal for parents post-school-run. Clay courts, kept in immaculate shape by Sjoerd.",
  },
  {
    name: "Spring 1 Sat 11:00-12:30PM Adv. Beginner to Low Intermediate Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sat",
    startTime: t(11, 0),
    endTime: t(12, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "238.00",
    publicNotes:
      "Saturday-morning adults. Drills, rallies, light points — coffee at the clubhouse after.",
  },
  {
    name: "Spring 1 Sun 12:00-1:30PM Beginner to Advanced Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sun",
    startTime: t(12, 0),
    endTime: t(13, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "216.00",
    publicNotes:
      "Sunday open-level adult group — coach matches drills to whoever shows up. Friendly, social vibe.",
  },

  // ----- Spring 2 2026 · Kids group (Triaz) -------------------------------
  {
    name: "Spring Ages 4-6 Sat. 10:15-11:00AM 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sat",
    startTime: t(10, 15),
    endTime: t(11, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 4,
    maxAge: 6,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "133.00",
    publicNotes:
      "Mini-tennis for the smallest players: foam balls, mini nets, lots of running games. 45 min flies by.",
  },
  {
    name: "Spring Ages 4-6 Sunday 9:45-10:30AM 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sun",
    startTime: t(9, 45),
    endTime: t(10, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 4,
    maxAge: 6,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "133.00",
    publicNotes:
      "Sunday-morning mini-tennis. Foam balls, lots of laughter, parents welcome to watch from the deck.",
  },
  {
    name: "Spring Ages 4-6 Weds. 2:45-3:30PM 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(14, 45),
    endTime: t(15, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 4,
    maxAge: 6,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "133.00",
    publicNotes:
      "Wednesday-afternoon mini-tennis. School-friendly start time, parent drop-off welcome.",
  },
  {
    name: "Spring Ages 5-7 Weds. 2:45-3:45PM 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(14, 45),
    endTime: t(15, 45),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 5,
    maxAge: 7,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "168.00",
    publicNotes:
      "One step up from mini-tennis: orange/green ball, real strokes, simple rallies. 60 min.",
  },
  {
    name: "Spring Ages 7-13 Friday 4-5:30PM Adv. Beg to High Performance divided by age and level 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "fri",
    startTime: t(16, 0),
    endTime: t(17, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 13,
    maxStudents: 12,
    minStudents: 5,
    pricePerSeries: "266.00",
    publicNotes:
      "Multi-court Friday session. Coaches split the kids by age + level so everyone gets the right intensity.",
  },
  {
    name: "Spring Ages 7-13 Sunday 10:30-12:00PM Beginner to High Performance divided by level 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sun",
    startTime: t(10, 30),
    endTime: t(12, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 13,
    maxStudents: 12,
    minStudents: 5,
    pricePerSeries: "266.00",
    publicNotes:
      "Sunday-morning kids program. Coaches re-balance the groups every few weeks so kids progress at their own pace.",
  },
  {
    name: "Spring Ages 7-13 Wednesday 4-5:30PM Adv. Beg to High Performance divided by age and level 2026",
    programSlug: "kids-group",
    seasonSlug: SPRING2.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(16, 0),
    endTime: t(17, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 13,
    maxStudents: 12,
    minStudents: 5,
    pricePerSeries: "266.00",
    publicNotes:
      "Mid-week kids session. Strong group of regulars — great atmosphere for kids who want to play a lot.",
  },

  // ----- Spring 2 2026 · High Performance ---------------------------------
  {
    name: "Spring High Perf. Tuesday 4:00-5:30 Ages 7-9 2026",
    programSlug: "high-performance",
    seasonSlug: SPRING2.slug,
    classType: "high_performance",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "tue",
    startTime: t(16, 0),
    endTime: t(17, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 9,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "Performance pathway for committed 7-9 year-olds. Technique block, then competitive points to close.",
  },
  {
    name: "Spring High Perfor. Mon. 4:30-6PM Ages 9-14 Advanced 2026",
    programSlug: "high-performance",
    seasonSlug: SPRING2.slug,
    classType: "high_performance",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "mon",
    startTime: t(16, 30),
    endTime: t(18, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 9,
    maxAge: 14,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "350.00",
    publicNotes:
      "Top-end junior performance group. Players should already be rallying consistently and playing tournaments.",
  },

  // ----- Spring 2 2026 · School pickups -----------------------------------
  {
    name: "Spring Adv. Beg Weds 12-1:45 Ages 4-6 AICS School Pickup 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "aics",
    dayOfWeek: "wed",
    startTime: t(12, 30),
    endTime: t(13, 45),
    pickupAt: t(12, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 4,
    maxAge: 6,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "Coach picks the kids up at AICS at 12:00 in the gocab and rides them to Triaz. Snack break before lessons start.",
  },
  {
    name: "Spring Adv. Beg Weds 12-2:15 Ages 7-9 AICS School Pickup 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "aics",
    dayOfWeek: "wed",
    startTime: t(12, 30),
    endTime: t(14, 15),
    pickupAt: t(12, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 9,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "405.00",
    publicNotes:
      "AICS Wednesday pickup for the 7-9 group. Longer lesson + supervised travel back. Kids ready for parent collection at Triaz at 14:15.",
  },
  {
    name: "Spring Adv. Beg Thurs 3:15-5:15 Ages 7-9 AICS (South) School Pickup 2026 Randwijck",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "randwijck",
    schoolSlug: "aics",
    dayOfWeek: "thu",
    startTime: t(15, 45),
    endTime: t(17, 15),
    pickupAt: t(15, 15),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 9,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "405.00",
    publicNotes:
      "AICS South-campus pickup, riding to Randwijck on the gocab. Lessons on Sjoerd's clay courts. Pickup from 17:15 at Randwijck.",
  },
  {
    name: "Spring BSA Monday 3:15-4:45pm After school pickup ages 5-7 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "bsa",
    dayOfWeek: "mon",
    startTime: t(15, 45),
    endTime: t(16, 45),
    pickupAt: t(15, 15),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 5,
    maxAge: 7,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "BSA Monday pickup for the youngest group. Coach collects from school at 15:15 and rides to Triaz; lesson + snack; parent pickup 16:45.",
  },
  {
    name: "Spring BSA Monday 3:15-5:15pm After school pickup ages 8-12 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "bsa",
    dayOfWeek: "mon",
    startTime: t(15, 45),
    endTime: t(17, 15),
    pickupAt: t(15, 15),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 8,
    maxAge: 12,
    maxStudents: 8,
    minStudents: 4,
    pricePerSeries: "405.00",
    publicNotes:
      "BSA Monday pickup for the 8-12 group. Longer 90-min lesson. Pickup 15:15 at school, parent collection 17:15 at Triaz.",
  },
  {
    name: "Spring Ages 5-6 Friday Advanced Beginner 12:30-2:00PM-Amity School Pickup 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "randwijck",
    schoolSlug: "amity",
    dayOfWeek: "fri",
    startTime: t(13, 0),
    endTime: t(14, 0),
    pickupAt: t(12, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 5,
    maxAge: 6,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "Amity Friday pickup for the youngest. Coach collects 12:30, lessons at Randwijck 13:00-14:00. Quiet morning courts.",
  },
  {
    name: "Spring Ages 7-10 Friday Beg-Adv. Beginner 12:30-2:30PM-Amity School Pickup 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "randwijck",
    schoolSlug: "amity",
    dayOfWeek: "fri",
    startTime: t(13, 0),
    endTime: t(14, 30),
    pickupAt: t(12, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 7,
    maxAge: 10,
    maxStudents: 8,
    minStudents: 4,
    pricePerSeries: "405.00",
    publicNotes:
      "Amity Friday pickup for the 7-10 group. 90-min lessons at Randwijck on the clay courts.",
  },
  {
    name: "Spring Adv. Beg Thurs 2:15-3:45 Ages 6-8 Kindercampus Zuidas pickup 2026",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "kindercampus",
    dayOfWeek: "thu",
    startTime: t(14, 45),
    endTime: t(15, 45),
    pickupAt: t(14, 15),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 6,
    maxAge: 8,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "Kindercampus Zuidas Thursday pickup. Coach collects 14:15, short ride to Triaz, 60-min lesson. Parent pickup at Triaz from 15:45.",
  },
  {
    name: "IFS Wednesday 1:00-2:45 Ages 8-12 After school pickup 25/26",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "ifs",
    dayOfWeek: "wed",
    startTime: t(13, 30),
    endTime: t(14, 45),
    pickupAt: t(13, 0),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 8,
    maxAge: 12,
    maxStudents: 8,
    minStudents: 4,
    pricePerSeries: "405.00",
    publicNotes:
      "IFS Wednesday-afternoon pickup. Coach collects at 13:00, lessons at Triaz. Long-running fixture for the IFS community.",
  },
  {
    name: "IFS Friday Age 8-12 3:30-5:30pm After school pickup 25/26",
    programSlug: "school-programs",
    seasonSlug: SPRING2.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "ifs",
    dayOfWeek: "fri",
    startTime: t(16, 0),
    endTime: t(17, 30),
    pickupAt: t(15, 30),
    startsOn: SPRING2.startsOn,
    endsOn: SPRING2.endsOn,
    minAge: 8,
    maxAge: 12,
    maxStudents: 8,
    minStudents: 4,
    pricePerSeries: "405.00",
    publicNotes:
      "IFS Friday end-of-week pickup. Pickup 15:30, lesson 16:00-17:30 at Triaz. Great way to wind down the school week.",
  },

  // ----- Fall 1 2026 · Adult group ----------------------------------------
  {
    name: "FALL 1 Mon 7:30-9:00PM Intermediate to Advanced Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: FALL1.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "mon",
    startTime: t(19, 30),
    endTime: t(21, 0),
    startsOn: FALL1.startsOn,
    endsOn: FALL1.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "216.00",
    publicNotes:
      "Fall continuation of the Monday Intermediate-Advanced group. Same group, same time — book early to keep your spot.",
  },
  {
    name: "FALL 1 Wed 6:30-8:00PM Adult Advanced Beginner to Advanced Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: FALL1.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "wed",
    startTime: t(18, 30),
    endTime: t(20, 0),
    startsOn: FALL1.startsOn,
    endsOn: FALL1.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "216.00",
    publicNotes:
      "Wednesday evening adults — the popular mixed-level group. Coach splits the court so everyone gets the right intensity.",
  },
  {
    name: "FALL 1 Sun. 12:00-1:30PM Adult Adv. Beginner to Advanced Triaz 2026",
    programSlug: "adult-group",
    seasonSlug: FALL1.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "sun",
    startTime: t(12, 0),
    endTime: t(13, 30),
    startsOn: FALL1.startsOn,
    endsOn: FALL1.endsOn,
    minAge: 16,
    maxAge: 99,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "216.00",
    publicNotes:
      "Sunday-midday adult group. Friendly social atmosphere; coach mixes drills and points based on who's there.",
  },

  // ----- Fall 1 2026 · Kids group + School pickup -------------------------
  {
    name: "Fall Ages 7-13 Friday 4:00-5:30PM Beginner to High Performance divided by age and level Triaz 2026",
    programSlug: "kids-group",
    seasonSlug: FALL1.slug,
    classType: "group_lesson",
    deliveryMode: "at_club",
    venueSlug: "triaz",
    dayOfWeek: "fri",
    startTime: t(16, 0),
    endTime: t(17, 30),
    startsOn: FALL1.startsOn,
    endsOn: FALL1.endsOn,
    minAge: 7,
    maxAge: 13,
    maxStudents: 12,
    minStudents: 5,
    pricePerSeries: "266.00",
    publicNotes:
      "Fall continuation of the Friday-afternoon kids program. Coaches split the kids by age + level on arrival.",
  },
  {
    name: "Fall BSA Monday 3:15-4:45pm After school pickup ages 5-8 TRIAZ 2026",
    programSlug: "school-programs",
    seasonSlug: FALL1.slug,
    classType: "school_pickup",
    deliveryMode: "pickup",
    venueSlug: "triaz",
    schoolSlug: "bsa",
    dayOfWeek: "mon",
    startTime: t(15, 45),
    endTime: t(16, 45),
    pickupAt: t(15, 15),
    startsOn: FALL1.startsOn,
    endsOn: FALL1.endsOn,
    minAge: 5,
    maxAge: 8,
    maxStudents: 6,
    minStudents: 3,
    pricePerSeries: "320.00",
    publicNotes:
      "BSA Monday pickup, fall edition. Pickup at school 15:15, lesson at Triaz 15:45-16:45.",
  },
];

// ---------------------------------------------------------------------------
// Misc seed steps (Tier-2 holiday backfill, STUB cleanup) — same as the
// stub-catalog script previously did.
// ---------------------------------------------------------------------------

async function backfillSeasonHolidays() {
  // Placeholder NL school-holiday hints. Only set when the season has
  // none, so admin edits via Studio aren't clobbered by a re-seed.
  const presets: { slug: string; dates: Date[] }[] = [
    {
      slug: SPRING2.slug,
      dates: [d(2026, 5, 5)], // Liberation Day, Tue.
    },
    {
      slug: FALL1.slug,
      dates: [d(2026, 10, 19), d(2026, 10, 20), d(2026, 10, 21)], // Herfstvakantie sample
    },
  ];

  for (const p of presets) {
    const season = await prisma.season.findUnique({ where: { slug: p.slug } });
    if (!season) continue;
    if (season.defaultExcludedDates.length > 0) continue;
    await prisma.season.update({
      where: { id: season.id },
      data: { defaultExcludedDates: p.dates },
    });
  }
}

async function dropLegacyStubSeries(): Promise<number> {
  const stubs = await prisma.classSeries.findMany({
    where: { name: { startsWith: "STUB ·" } },
    select: { id: true },
  });
  if (stubs.length === 0) return 0;
  const ids = stubs.map((s) => s.id);
  // Cascade-style cleanup: delete dependent rows first so we don't trip
  // any FKs. Enrollments are the only realistic dependents on a fresh
  // dev DB.
  await prisma.enrollment.deleteMany({ where: { classSeriesId: { in: ids } } });
  await prisma.classSession.deleteMany({
    where: { classSeriesId: { in: ids } },
  });
  await prisma.classSeriesCoach.deleteMany({
    where: { classSeriesId: { in: ids } },
  });
  await prisma.classSeries.deleteMany({ where: { id: { in: ids } } });
  return stubs.length;
}

// ---------------------------------------------------------------------------
// Main upsert loop.
// ---------------------------------------------------------------------------

async function seedSeries() {
  // Bulk-load every referenced row up front so the per-series loop only
  // does one upsert each.
  const programs = await prisma.program.findMany({
    where: { slug: { in: [...new Set(SERIES.map((s) => s.programSlug))] } },
  });
  const seasons = await prisma.season.findMany({
    where: { slug: { in: [...new Set(SERIES.map((s) => s.seasonSlug))] } },
  });
  const venues = await prisma.venue.findMany({
    where: { slug: { in: [...new Set(SERIES.map((s) => s.venueSlug))] } },
  });
  const schools = await prisma.school.findMany({
    where: {
      slug: {
        in: [
          ...new Set(SERIES.map((s) => s.schoolSlug).filter(Boolean) as string[]),
        ],
      },
    },
  });

  const programBySlug = new Map(programs.map((p) => [p.slug, p]));
  const seasonBySlug = new Map(seasons.map((s) => [s.slug, s]));
  const venueBySlug = new Map(venues.map((v) => [v.slug, v]));
  const schoolBySlug = new Map(schools.map((s) => [s.slug, s]));

  const placeholderCoach = await prisma.coach.findUnique({
    where: { personId: SYSTEM_NO_COACH_PERSON_ID },
  });
  if (!placeholderCoach) {
    throw new Error(
      "Placeholder coach (NO COACH YET) is missing — run `npm run db:seed` first.",
    );
  }

  // Default lead coach for every seeded series. We prefer Carlos Mendez
  // (the example head coach created by `npm run db:seed-examples`) so
  // the catalog looks staffed out of the box; if he hasn't been seeded
  // yet we fall back to the synthetic placeholder so the script still
  // runs cleanly on a fresh DB.
  const carlos = await prisma.coach.findFirst({
    where: { person: { firstName: "Carlos", lastName: "Mendez" } },
    select: { personId: true },
  });
  const leadCoachPersonId = carlos?.personId ?? SYSTEM_NO_COACH_PERSON_ID;
  if (!carlos) {
    console.warn(
      "  ! Carlos Mendez not found - falling back to NO COACH YET. " +
        "Run `npm run db:seed-examples` first to seed Carlos.",
    );
  }

  let created = 0;
  let updated = 0;
  for (const spec of SERIES) {
    const program = programBySlug.get(spec.programSlug);
    const season = seasonBySlug.get(spec.seasonSlug);
    const venue = venueBySlug.get(spec.venueSlug);
    const school = spec.schoolSlug ? schoolBySlug.get(spec.schoolSlug) : null;
    if (!program || !season || !venue) {
      throw new Error(
        `Missing program/season/venue for "${spec.name}". Run \`npm run db:seed\` first.`,
      );
    }
    if (spec.schoolSlug && !school) {
      throw new Error(
        `Missing school "${spec.schoolSlug}" for "${spec.name}". Run \`npm run db:seed\` first.`,
      );
    }

    // Default pickup-time fallback for school pickups so the row is
    // never null on a delivery=pickup series.
    const pickupAt =
      spec.pickupAt ??
      (spec.deliveryMode === "pickup" ? minus(spec.startTime, 30) : null);

    const data = {
      programId: program.id,
      seasonId: season.id,
      name: spec.name,
      classType: spec.classType,
      deliveryMode: spec.deliveryMode,
      venueId: venue.id,
      schoolId: school?.id ?? null,
      dayOfWeek: spec.dayOfWeek,
      startTime: spec.startTime,
      endTime: spec.endTime,
      pickupAt,
      startsOn: spec.startsOn,
      endsOn: spec.endsOn,
      excludedDates: season.defaultExcludedDates,
      maxStudents: spec.maxStudents,
      minStudents: spec.minStudents ?? null,
      waitlistEnabled: true,
      eligibleSkillLevels: [] as never[],
      minAge: spec.minAge,
      maxAge: spec.maxAge,
      visibility: "public" as const,
      pricePerSeries: spec.pricePerSeries,
      status: "published" as const,
      publicNotes: spec.publicNotes,
      publishedAt: new Date(),
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

    // Reconcile the lead coach: drop any existing lead-role row (e.g.
    // the previous run's "NO COACH YET" placeholder) and put Carlos in
    // its place. Assistant-role rows added by admins via the UI are
    // intentionally left alone so manual fine-tuning sticks.
    await prisma.classSeriesCoach.deleteMany({
      where: { classSeriesId: seriesId, role: "lead" },
    });
    await prisma.classSeriesCoach.create({
      data: {
        classSeries: { connect: { id: seriesId } },
        coach: { connect: { personId: leadCoachPersonId } },
        role: "lead",
      },
    });

    // Regenerate the schedule. We only touch *future* `scheduled`
    // sessions: anything in the past, or anything an admin has marked
    // `completed` / `cancelled`, is left alone so re-runs don't erase
    // history or manual cancellations.
    await regenerateScheduledSessions({
      seriesId,
      startsOn: spec.startsOn,
      endsOn: spec.endsOn,
      dayOfWeek: spec.dayOfWeek,
      startTime: spec.startTime,
      endTime: spec.endTime,
      excludedDates: season.defaultExcludedDates,
    });
  }

  return { created, updated };
}

/**
 * Idempotent session backfill: wipe future scheduled rows for the
 * series and recreate them from the canonical generator. Mirrors the
 * "save & regenerate" branch of the admin schedule action.
 */
async function regenerateScheduledSessions(args: {
  seriesId: string;
  startsOn: Date;
  endsOn: Date;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTime: Date;
  endTime: Date;
  excludedDates: Date[];
}): Promise<void> {
  const now = new Date();
  await prisma.classSession.deleteMany({
    where: {
      classSeriesId: args.seriesId,
      startsAt: { gte: now },
      status: "scheduled",
    },
  });

  const dates = generateSessionDates({
    startsOn: args.startsOn,
    endsOn: args.endsOn,
    dayOfWeek: args.dayOfWeek,
    startTime: args.startTime,
    endTime: args.endTime,
    excluded: new Set(args.excludedDates.map((d) => toDateKey(d))),
  }).filter((s) => s.startsAt >= now);

  if (dates.length === 0) return;

  await prisma.classSession.createMany({
    data: dates.map((s) => ({
      classSeriesId: args.seriesId,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      status: "scheduled" as const,
    })),
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed real catalog in production.");
  }

  console.log("Backfilling Tier-2 holiday dates on seasons…");
  await backfillSeasonHolidays();

  const dropped = await dropLegacyStubSeries();
  if (dropped > 0) {
    console.log(`Dropped ${dropped} legacy STUB · series.`);
  }

  console.log(`Seeding ${SERIES.length} GoTimmy-shaped class series…`);
  const { created, updated } = await seedSeries();
  console.log(
    `  + ${created} created, ~ ${updated} updated, ${SERIES.length} total.`,
  );

  console.log("Real catalog seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
