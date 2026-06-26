/**
 * Parse Higgins NL office calendar ICS into canonical Spring class specs.
 *
 * Source: calendarnl/higginstennisnloffice@gmail.com 2.ics
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DayOfWeekKey } from "../../src/lib/classes/session-dates";
import { resolveCoachKeysFromTitle } from "./coach-registry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type SeasonHalf = "spring1" | "spring2";

export type CalendarClassSpec = {
  fingerprint: string;
  name: string;
  seasonHalf: SeasonHalf;
  seasonSlug: string;
  programSlug: "adult-group" | "kids-group" | "high-performance" | "school-programs";
  classType:
    | "group_lesson"
    | "high_performance"
    | "school_pickup"
    | "school_onsite";
  deliveryMode: "at_club" | "pickup";
  venueSlug: "triaz" | "randwijck";
  schoolSlug?: "aics" | "bsa" | "amity" | "ifs" | "kindercampus";
  dayOfWeek: DayOfWeekKey;
  startTime: { hh: number; mm: number };
  endTime: { hh: number; mm: number };
  pickupAt?: { hh: number; mm: number };
  startsOn: Date;
  endsOn: Date;
  excludedDates: Date[];
  minAge: number;
  maxAge: number;
  maxStudents: number;
  minStudents: number;
  pricePerSeries: string;
  publicNotes: string;
  coachKeys: string[];
  enrolledCountHint: number | null;
  sourceTitle: string;
};

type ParsedEvent = {
  summary: string;
  dtstart: string;
  dtend: string;
  rrule: string;
  exdates: string[];
  attendees: string[];
};

const BYDAY_MAP: Record<string, DayOfWeekKey> = {
  MO: "mon",
  TU: "tue",
  WE: "wed",
  TH: "thu",
  FR: "fri",
  SA: "sat",
  SU: "sun",
};

const SPRING1_YOUTH = {
  slug: "spring-1-2026-youth",
  startsOn: d(2026, 1, 6),
  endsOn: d(2026, 3, 29),
  excluded: [d(2026, 2, 16), d(2026, 2, 17), d(2026, 2, 18)],
};

const SPRING2_YOUTH = {
  slug: "spring-2-2026-youth",
  startsOn: d(2026, 4, 6),
  endsOn: d(2026, 6, 28),
  excluded: [d(2026, 5, 5)],
};

const SPRING1_ADULT = { slug: "spring-1-2026-adult" };
const SPRING2_ADULT = { slug: "spring-2-2026-adult" };

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

function unfoldIcs(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function parseEvents(ics: string): ParsedEvent[] {
  const unfolded = unfoldIcs(ics);
  const out: ParsedEvent[] = [];

  for (const block of unfolded.split("BEGIN:VEVENT")) {
    if (!block.includes("END:VEVENT")) continue;
    const body = block.split("END:VEVENT")[0];
    const summary = body
      .match(/^SUMMARY:(.+)$/m)?.[1]
      ?.replace(/\\,/g, ",")
      .replace(/\\n/g, " ")
      .trim();
    if (!summary || !/spring/i.test(summary)) continue;

    const dtstart = body.match(/^DTSTART[^:]*:(.+)$/m)?.[1]?.trim();
    const dtend = body.match(/^DTEND[^:]*:(.+)$/m)?.[1]?.trim();
    const rrule = body.match(/^RRULE:(.+)$/m)?.[1]?.trim();
    if (!dtstart || !dtend || !rrule || !rrule.includes("WEEKLY")) continue;

    const exdates = [...body.matchAll(/^EXDATE[^:]*:(.+)$/gm)].map((m) => m[1].trim());
    const attendees = [...body.matchAll(/mailto:([^\s\r\n>]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    );

    out.push({ summary, dtstart, dtend, rrule, exdates, attendees });
  }
  return out;
}

function parseIcsDateTime(raw: string): {
  y: number;
  mo: number;
  d: number;
  hh: number;
  mm: number;
} {
  const m = raw.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) throw new Error(`Bad DTSTART/DTEND: ${raw}`);
  return {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    hh: +m[4],
    mm: +m[5],
  };
}

function parseExdate(raw: string): Date | null {
  const m = raw.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return d(+m[1], +m[2], +m[3]);
}

function rruleDay(rrule: string): DayOfWeekKey | null {
  const m = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!m) return null;
  return BYDAY_MAP[m[1].split(",")[0]] ?? null;
}

function detectSeasonHalf(title: string, startYear: number): SeasonHalf {
  const u = title.toUpperCase();
  if (/SPRING\s*2\b/.test(u)) return "spring2";
  if (/SPRING\s*1\b/.test(u) || /EARLY\s+SPRING/.test(u)) return "spring1";
  if (startYear >= 2026) return "spring2";
  return "spring1";
}

function isNoise(title: string): boolean {
  const t = title.toLowerCase();
  if (/cancelled|canceled|no class|makeup|trial|private|meeting|holiday|vacation/.test(t))
    return true;
  if (/pickup gocab|gocab 12/.test(t) && !/school pickup|bsa|aics|amity|ages/.test(t))
    return true;
  return false;
}

function parseVenue(title: string): "triaz" | "randwijck" | null {
  const t = title.toLowerCase();
  if (/randwijck|randwijk/.test(t)) return "randwijck";
  if (/triaz/.test(t)) return "triaz";
  return null;
}

function parseSchool(title: string): CalendarClassSpec["schoolSlug"] | undefined {
  const t = title.toLowerCase();
  if (/aics/.test(t)) return "aics";
  if (/\bbsa\b/.test(t)) return "bsa";
  if (/amity/.test(t)) return "amity";
  if (/\bifs\b/.test(t)) return "ifs";
  if (/kindercampus/.test(t)) return "kindercampus";
  return undefined;
}

function parseAgeBands(title: string): { minAge: number; maxAge: number }[] {
  const bands: { minAge: number; maxAge: number }[] = [];
  for (const m of title.matchAll(/ages?\s*(\d+)\s*[-–]\s*(\d+)/gi)) {
    bands.push({ minAge: +m[1], maxAge: +m[2] });
  }
  if (bands.length === 0) {
    if (/4-6|4\s*-\s*6/.test(title)) bands.push({ minAge: 4, maxAge: 6 });
    else if (/7-13/.test(title)) bands.push({ minAge: 7, maxAge: 13 });
    else if (/7-12|7-10|8-12/.test(title)) bands.push({ minAge: 7, maxAge: 12 });
    else if (/9-14/.test(title)) bands.push({ minAge: 9, maxAge: 14 });
    else if (/5-7/.test(title)) bands.push({ minAge: 5, maxAge: 7 });
  }
  return bands;
}

function parseEnrolledHint(title: string): number | null {
  const m = title.match(/M(Ramzi|Farah|William)\((\d+)/i);
  if (m) return +m[2];
  const m2 = title.match(/\((\d+)\+?\)/);
  if (m2) return +m2[1];
  return null;
}

function classifyEvent(
  title: string,
  school?: string,
): Pick<
  CalendarClassSpec,
  "programSlug" | "classType" | "deliveryMode" | "minAge" | "maxAge" | "maxStudents" | "pricePerSeries"
> {
  const t = title.toLowerCase();
  const isLearnPlay = /learn\s*&\s*play|l&p/.test(t);
  const isPickup = /pickup|pick up|pick-up|after school/.test(t) || !!school;
  const isHp = /high perf|high performance/.test(t);
  const isAdult =
    /adult|learn\s*&\s*play|l&p|invite/.test(t) && !/youth ages|ages\s*[4-9]/.test(t);

  if (isPickup && school) {
    const ages = parseAgeBands(title)[0] ?? { minAge: 5, maxAge: 12 };
    return {
      programSlug: "school-programs",
      classType: "school_pickup",
      deliveryMode: "pickup",
      minAge: ages.minAge,
      maxAge: ages.maxAge,
      maxStudents: ages.maxAge <= 7 ? 6 : 8,
      pricePerSeries: ages.maxAge <= 7 ? "320.00" : "405.00",
    };
  }

  if (isHp) {
    const ages = parseAgeBands(title)[0] ?? { minAge: 7, maxAge: 14 };
    return {
      programSlug: "high-performance",
      classType: "high_performance",
      deliveryMode: "at_club",
      minAge: ages.minAge,
      maxAge: ages.maxAge,
      maxStudents: 8,
      pricePerSeries: "350.00",
    };
  }

  if (isAdult || isLearnPlay) {
    return {
      programSlug: "adult-group",
      classType: "group_lesson",
      deliveryMode: "at_club",
      minAge: 16,
      maxAge: 99,
      maxStudents: isLearnPlay ? 8 : 6,
      pricePerSeries: isLearnPlay ? "199.00" : "238.00",
    };
  }

  const ages = parseAgeBands(title)[0] ?? { minAge: 7, maxAge: 13 };
  return {
    programSlug: "kids-group",
    classType: "group_lesson",
    deliveryMode: "at_club",
    minAge: ages.minAge,
    maxAge: ages.maxAge,
    maxStudents: ages.maxAge - ages.minAge > 4 ? 12 : 6,
    pricePerSeries: ages.maxAge <= 6 ? "133.00" : ages.maxAge <= 7 ? "168.00" : "266.00",
  };
}

function normalizeSkill(title: string): string {
  const t = title.toLowerCase();
  if (/learn\s*&\s*play/.test(t)) return "learn_play";
  if (/high perf/.test(t)) return "high_perf";
  if (/pickup|pick up/.test(t)) return "pickup";
  if (/inter.*adv|int.*adv/.test(t)) return "int_adv";
  if (/beginner|beg/.test(t)) return "beg";
  return "general";
}

function buildFingerprint(parts: {
  seasonHalf: SeasonHalf;
  venue: string;
  day: string;
  start: string;
  end: string;
  minAge: number;
  maxAge: number;
  program: string;
  school?: string;
  skill: string;
}): string {
  return [
    parts.seasonHalf,
    parts.venue,
    parts.school ?? "",
    parts.day,
    parts.start,
    parts.end,
    parts.minAge,
    parts.maxAge,
    parts.program,
    parts.skill,
  ].join("|");
}

function formatDisplayName(
  spec: Omit<CalendarClassSpec, "fingerprint" | "name">,
): string {
  const dayLabel = spec.dayOfWeek.charAt(0).toUpperCase() + spec.dayOfWeek.slice(1);
  const st = `${String(spec.startTime.hh).padStart(2, "0")}:${String(spec.startTime.mm).padStart(2, "0")}`;
  const et = `${String(spec.endTime.hh).padStart(2, "0")}:${String(spec.endTime.mm).padStart(2, "0")}`;
  const venue = spec.venueSlug === "triaz" ? "Triaz" : "Randwijck";
  const half = spec.seasonHalf === "spring1" ? "Spring 1" : "Spring 2";

  if (spec.programSlug === "school-programs" && spec.schoolSlug) {
    return `${half} ${spec.schoolSlug.toUpperCase()} Pickup Ages ${spec.minAge}-${spec.maxAge} ${dayLabel} ${st}-${et} ${venue} 2026`;
  }
  if (spec.programSlug === "adult-group") {
    return `${half} ${dayLabel} ${st}-${et} Adult ${venue} 2026`;
  }
  if (spec.programSlug === "high-performance") {
    return `${half} High Perf Ages ${spec.minAge}-${spec.maxAge} ${dayLabel} ${st}-${et} ${venue} 2026`;
  }
  return `${half} Ages ${spec.minAge}-${spec.maxAge} ${dayLabel} ${st}-${et} ${venue} 2026`;
}

function eventToSpecs(ev: ParsedEvent): CalendarClassSpec[] {
  if (isNoise(ev.summary)) return [];

  const venue = parseVenue(ev.summary);
  if (!venue) return [];

  const start = parseIcsDateTime(ev.dtstart);
  const end = parseIcsDateTime(ev.dtend);
  if (start.y < 2025) return [];

  const day = rruleDay(ev.rrule);
  if (!day) return [];

  const seasonHalf = detectSeasonHalf(ev.summary, start.y);
  const school = parseSchool(ev.summary);
  const skill = normalizeSkill(ev.summary);
  const coachKeys = resolveCoachKeysFromTitle(ev.summary);
  const enrolledCountHint = parseEnrolledHint(ev.summary);
  const exdates = ev.exdates.map(parseExdate).filter((x): x is Date => x !== null);

  const ageBands = parseAgeBands(ev.summary);
  const bands = ageBands.length > 0 ? ageBands : [null];

  const specs: CalendarClassSpec[] = [];

  for (const band of bands) {
    const classified = classifyEvent(ev.summary, school);
    const minAge = band?.minAge ?? classified.minAge;
    const maxAge = band?.maxAge ?? classified.maxAge;

    const isYouth =
      classified.programSlug === "kids-group" ||
      classified.programSlug === "high-performance" ||
      classified.programSlug === "school-programs";

    const seasonSlug =
      seasonHalf === "spring1"
        ? isYouth
          ? SPRING1_YOUTH.slug
          : SPRING1_ADULT.slug
        : isYouth
          ? SPRING2_YOUTH.slug
          : SPRING2_ADULT.slug;

    const window = seasonHalf === "spring1" ? SPRING1_YOUTH : SPRING2_YOUTH;
    const seasonExcluded =
      seasonHalf === "spring1" ? SPRING1_YOUTH.excluded : SPRING2_YOUTH.excluded;

    const fingerprint = buildFingerprint({
      seasonHalf,
      venue,
      day,
      start: `${start.hh}:${start.mm}`,
      end: `${end.hh}:${end.mm}`,
      minAge,
      maxAge,
      program: classified.programSlug,
      school,
      skill,
    });

    const base: Omit<CalendarClassSpec, "fingerprint" | "name"> = {
      seasonHalf,
      seasonSlug,
      programSlug: classified.programSlug,
      classType: classified.classType,
      deliveryMode: classified.deliveryMode,
      venueSlug: venue,
      schoolSlug: school,
      dayOfWeek: day,
      startTime: { hh: start.hh, mm: start.mm },
      endTime: { hh: end.hh, mm: end.mm },
      pickupAt:
        classified.deliveryMode === "pickup"
          ? { hh: start.hh, mm: Math.max(0, start.mm - 30) }
          : undefined,
      startsOn: window.startsOn,
      endsOn: window.endsOn,
      excludedDates: [...seasonExcluded, ...exdates],
      minAge,
      maxAge,
      maxStudents: classified.maxStudents,
      minStudents: 3,
      pricePerSeries: classified.pricePerSeries,
      publicNotes: `Imported from NL office calendar: ${ev.summary}`,
      coachKeys,
      enrolledCountHint,
      sourceTitle: ev.summary,
    };

    specs.push({
      ...base,
      fingerprint,
      name: formatDisplayName(base),
    });
  }

  return specs;
}

type CuratedPartial = {
  fp: string;
  name: string;
  seasonHalf: SeasonHalf;
  seasonSlug: string;
  programSlug: CalendarClassSpec["programSlug"];
  classType: CalendarClassSpec["classType"];
  deliveryMode: CalendarClassSpec["deliveryMode"];
  venueSlug: "triaz" | "randwijck";
  schoolSlug?: CalendarClassSpec["schoolSlug"];
  dayOfWeek: DayOfWeekKey;
  startTime: { hh: number; mm: number };
  endTime: { hh: number; mm: number };
  pickupAt?: { hh: number; mm: number };
  minAge: number;
  maxAge: number;
  maxStudents: number;
  pricePerSeries: string;
  coachKeys: string[];
  enrolledCountHint?: number | null;
};

function mkCurated(p: CuratedPartial): CalendarClassSpec {
  const window = p.seasonHalf === "spring1" ? SPRING1_YOUTH : SPRING2_YOUTH;
  const excluded =
    p.seasonHalf === "spring1" ? SPRING1_YOUTH.excluded : SPRING2_YOUTH.excluded;

  const base: Omit<CalendarClassSpec, "fingerprint" | "name"> = {
    seasonHalf: p.seasonHalf,
    seasonSlug: p.seasonSlug,
    programSlug: p.programSlug,
    classType: p.classType,
    deliveryMode: p.deliveryMode,
    venueSlug: p.venueSlug,
    schoolSlug: p.schoolSlug,
    dayOfWeek: p.dayOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    pickupAt: p.pickupAt,
    startsOn: window.startsOn,
    endsOn: window.endsOn,
    excludedDates: excluded,
    minAge: p.minAge,
    maxAge: p.maxAge,
    maxStudents: p.maxStudents,
    minStudents: 3,
    pricePerSeries: p.pricePerSeries,
    publicNotes: p.name,
    coachKeys: p.coachKeys,
    enrolledCountHint: p.enrolledCountHint ?? null,
    sourceTitle: p.name,
  };

  return {
    ...base,
    fingerprint: p.fp,
    name: p.name,
  };
}

function curatedSpringSpecs(): CalendarClassSpec[] {
  const c = (
    fp: string,
    name: string,
    seasonHalf: SeasonHalf,
    seasonSlug: string,
    programSlug: CalendarClassSpec["programSlug"],
    venueSlug: "triaz" | "randwijck",
    dayOfWeek: DayOfWeekKey,
    sh: number,
    sm: number,
    eh: number,
    em: number,
    minAge: number,
    maxAge: number,
    maxStudents: number,
    price: string,
    coachKeys: string[],
    extra?: Partial<CuratedPartial>,
  ): CuratedPartial => ({
    fp,
    name,
    seasonHalf,
    seasonSlug,
    programSlug,
    classType: extra?.classType ?? "group_lesson",
    deliveryMode: extra?.deliveryMode ?? "at_club",
    venueSlug,
    schoolSlug: extra?.schoolSlug,
    dayOfWeek,
    startTime: { hh: sh, mm: sm },
    endTime: { hh: eh, mm: em },
    pickupAt: extra?.pickupAt,
    minAge,
    maxAge,
    maxStudents,
    pricePerSeries: price,
    coachKeys,
    enrolledCountHint: extra?.enrolledCountHint,
  });

  return [
    c("s2-ad-mon-int", "Spring 2 Mon 7:30-9:00PM Intermediate to Advanced Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "mon", 19, 30, 21, 0, 16, 99, 6, "272.00", ["ramzi", "farah"]),
    c("s2-ad-tue-beg", "Spring 2 Tue 6:30-8:00PM Beginner to Intermediate Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "tue", 18, 30, 20, 0, 16, 99, 6, "238.00", ["ramzi", "ivan"]),
    c("s2-ad-wed-am", "Spring 2 Wed 10:00-11:30AM Adv. Beginner to Low Intermediate Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "wed", 10, 0, 11, 30, 16, 99, 6, "238.00", ["farah"]),
    c("s2-ad-wed-pm", "Spring 2 Wed 6:30-8:00PM Beginner to Intermediate Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "wed", 18, 30, 20, 0, 16, 99, 6, "238.00", ["ramzi", "farah", "ivan"]),
    c("s2-ad-lp-wed", "Spring 2 Wed 6:30-8:00PM Adult Learn & Play Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "wed", 18, 30, 20, 0, 16, 99, 8, "199.00", ["ramzi", "farah", "ivan"]),
    c("s2-ad-lp-rw", "Spring 2 Fri 6:00-7:30PM Adult Learn & Play Randwijck 2026", "spring2", "spring-2-2026-adult", "adult-group", "randwijck", "fri", 18, 0, 19, 30, 16, 99, 8, "199.00", ["ramzi"]),
    c("s2-ad-thu-rw", "Spring 2 Thu 6:30-8:00PM Beginner to Adv. Beginner Randwijck 2026", "spring2", "spring-2-2026-adult", "adult-group", "randwijck", "thu", 18, 30, 20, 0, 16, 99, 6, "238.00", ["ivan"]),
    c("s2-ad-sun", "Spring 2 Sun 12:00-1:30PM Beginner to Advanced Triaz 2026", "spring2", "spring-2-2026-adult", "adult-group", "triaz", "sun", 12, 0, 13, 30, 16, 99, 6, "216.00", ["ivan"]),
    c("s2-y-46-sat", "Spring 2 Ages 4-6 Sat 10:15-11:00AM Triaz 2026", "spring2", "spring-2-2026-youth", "kids-group", "triaz", "sat", 10, 15, 11, 0, 4, 6, 6, "133.00", ["farah", "set"]),
    c("s2-y-46-sun", "Spring 2 Ages 4-6 Sun 9:45-10:30AM Triaz 2026", "spring2", "spring-2-2026-youth", "kids-group", "triaz", "sun", 9, 45, 10, 30, 4, 6, 6, "133.00", ["farah"]),
    c("s2-y-713-fri", "Spring 2 Ages 7-13 Fri 4:00-5:30PM Triaz 2026", "spring2", "spring-2-2026-youth", "kids-group", "triaz", "fri", 16, 0, 17, 30, 7, 13, 12, "266.00", ["ivan"], { enrolledCountHint: 7 }),
    c("s2-y-713-sun", "Spring 2 Ages 7-13 Sun 10:30-12:00PM Triaz 2026", "spring2", "spring-2-2026-youth", "kids-group", "triaz", "sun", 10, 30, 12, 0, 7, 13, 12, "266.00", ["farah", "ivan"]),
    c("s2-y-712-rw", "Spring 2 Ages 7-12 Sat Randwijck 2026", "spring2", "spring-2-2026-youth", "kids-group", "randwijck", "sat", 10, 0, 11, 30, 7, 12, 8, "238.00", ["ivan"]),
    c("s2-hp-tue", "Spring 2 High Perf Ages 7-9 Tue 4:00-5:30 Triaz 2026", "spring2", "spring-2-2026-youth", "high-performance", "triaz", "tue", 16, 0, 17, 30, 7, 9, 8, "350.00", ["farah", "ivan"], { classType: "high_performance" }),
    c("s2-hp-wed", "Spring 2 High Perf Ages 9-14 Wed Triaz 2026", "spring2", "spring-2-2026-youth", "high-performance", "triaz", "wed", 16, 0, 17, 30, 9, 14, 8, "350.00", ["ramzi"], { classType: "high_performance" }),
    c("s2-p-aics-46", "Spring 2 AICS Pickup Ages 4-6 Wed Triaz 2026", "spring2", "spring-2-2026-youth", "school-programs", "triaz", "wed", 12, 0, 13, 30, 4, 6, 6, "320.00", ["farah"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "aics", pickupAt: { hh: 11, mm: 30 } }),
    c("s2-p-aics-79", "Spring 2 AICS Pickup Ages 7-9 Wed Triaz 2026", "spring2", "spring-2-2026-youth", "school-programs", "triaz", "wed", 12, 0, 14, 15, 7, 9, 8, "405.00", ["farah", "giorgio"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "aics", pickupAt: { hh: 11, mm: 30 } }),
    c("s2-p-bsa-57", "Spring 2 BSA Pickup Ages 5-7 Mon Triaz 2026", "spring2", "spring-2-2026-youth", "school-programs", "triaz", "mon", 15, 45, 16, 45, 5, 7, 6, "320.00", ["noah"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "bsa", pickupAt: { hh: 15, mm: 15 } }),
    c("s2-p-bsa-812", "Spring 2 BSA Pickup Ages 8-12 Mon Triaz 2026", "spring2", "spring-2-2026-youth", "school-programs", "triaz", "mon", 15, 45, 17, 15, 8, 12, 8, "405.00", ["noah"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "bsa", pickupAt: { hh: 15, mm: 15 } }),
    c("s2-p-am-56", "Spring 2 Amity Pickup Ages 5-6 Fri Randwijck 2026", "spring2", "spring-2-2026-youth", "school-programs", "randwijck", "fri", 13, 0, 14, 0, 5, 6, 6, "320.00", ["william"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "amity", pickupAt: { hh: 12, mm: 30 } }),
    c("s2-p-am-710", "Spring 2 Amity Pickup Ages 7-10 Fri Randwijck 2026", "spring2", "spring-2-2026-youth", "school-programs", "randwijck", "fri", 13, 0, 14, 30, 7, 10, 8, "405.00", ["noah"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "amity", pickupAt: { hh: 12, mm: 30 } }),
    c("s1-ad-mon", "Spring 1 Mon 7:30-9:00PM Intermediate to Advanced Triaz 2026", "spring1", "spring-1-2026-adult", "adult-group", "triaz", "mon", 19, 30, 21, 0, 16, 99, 6, "272.00", ["ramzi", "farah"]),
    c("s1-y-46", "Spring 1 Ages 4-6 Sun 9:45-10:30AM Triaz 2026", "spring1", "spring-1-2026-youth", "kids-group", "triaz", "sun", 9, 45, 10, 30, 4, 6, 6, "133.00", ["farah"]),
    c("s1-y-713", "Spring 1 Ages 7-13 Fri 4:00-5:30PM Triaz 2026", "spring1", "spring-1-2026-youth", "kids-group", "triaz", "fri", 16, 0, 17, 30, 7, 13, 12, "266.00", ["ivan"]),
    c("s1-p-bsa", "Spring 1 BSA Pickup Ages 8-12 Mon Triaz 2026", "spring1", "spring-1-2026-youth", "school-programs", "triaz", "mon", 15, 45, 17, 15, 8, 12, 8, "405.00", ["noah"], { classType: "school_pickup", deliveryMode: "pickup", schoolSlug: "bsa", pickupAt: { hh: 15, mm: 15 } }),
  ].map(mkCurated);
}

export function defaultIcsPath(): string {
  return path.resolve(__dirname, "../../../calendarnl/higginstennisnloffice@gmail.com 2.ics");
}

export function parseNlCalendar(icsPath?: string): CalendarClassSpec[] {
  const file = icsPath ?? defaultIcsPath();
  let fromIcs: CalendarClassSpec[] = [];

  try {
    const ics = readFileSync(file, "utf8");
    fromIcs = parseEvents(ics).flatMap(eventToSpecs);
  } catch {
    console.warn(`  ! ICS not found at ${file} — using curated catalog only`);
  }

  return dedupeSpecs([...curatedSpringSpecs(), ...fromIcs]);
}

function dedupeSpecs(specs: CalendarClassSpec[]): CalendarClassSpec[] {
  const byFp = new Map<string, CalendarClassSpec>();
  for (const s of specs) {
    const existing = byFp.get(s.fingerprint);
    if (!existing) {
      byFp.set(s.fingerprint, s);
      continue;
    }
    if (!existing.name.startsWith("Spring") && s.name.startsWith("Spring")) {
      byFp.set(s.fingerprint, s);
    } else if ((s.enrolledCountHint ?? 0) > (existing.enrolledCountHint ?? 0)) {
      byFp.set(s.fingerprint, { ...existing, enrolledCountHint: s.enrolledCountHint });
    }
  }
  return [...byFp.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const SEASON_SPECS = [
  {
    slug: SPRING1_YOUTH.slug,
    name: "Spring 1 2026",
    audience: "youth" as const,
    startsOn: SPRING1_YOUTH.startsOn,
    endsOn: SPRING1_YOUTH.endsOn,
    defaultExcludedDates: SPRING1_YOUTH.excluded,
  },
  {
    slug: SPRING2_YOUTH.slug,
    name: "Spring 2 2026",
    audience: "youth" as const,
    startsOn: SPRING2_YOUTH.startsOn,
    endsOn: SPRING2_YOUTH.endsOn,
    defaultExcludedDates: SPRING2_YOUTH.excluded,
  },
  {
    slug: SPRING1_ADULT.slug,
    name: "Spring 1 2026",
    audience: "adult" as const,
    startsOn: null,
    endsOn: null,
    defaultExcludedDates: [] as Date[],
  },
  {
    slug: SPRING2_ADULT.slug,
    name: "Spring 2 2026",
    audience: "adult" as const,
    startsOn: null,
    endsOn: null,
    defaultExcludedDates: [] as Date[],
  },
];

export function timeToDate(hh: number, mm: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

export function minusMinutes(time: Date, minutes: number): Date {
  return new Date(time.getTime() - minutes * 60_000);
}
