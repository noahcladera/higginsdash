import type { ClubSlug } from "@/lib/pricing";

/**
 * Membership season calendar.
 *
 * Triaz runs year-round and sells two 6-month halves split around the
 * pivot dates below. Randwijck is a summer-only club (clay courts) that
 * opens earlier than Triaz's spring half and closes when the courts are
 * no longer playable in autumn.
 *
 * All real dates live in `SEASON_CONFIG` so changing the calendar later
 * is a single edit. Helpers below are pure (no `Date.now()` baked in)
 * so they're cheap to test.
 */

interface MonthDay {
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export interface SeasonConfig {
  triaz: {
    /** Pivot between the spring/summer half and the autumn/winter half. */
    halfPivots: MonthDay[];
  };
  randwijck: {
    /** First day of the summer Randwijck season. */
    opensOn: MonthDay;
    /** Last day Randwijck is playable. */
    closesOn: MonthDay;
  };
}

/**
 * Editable in one place. Today's defaults match what we agreed:
 *   - Triaz: April 1 ↔ September 1 split.
 *   - Randwijck: opens mid-March, closes end of October.
 */
export const SEASON_CONFIG: SeasonConfig = {
  triaz: {
    halfPivots: [
      { month: 4, day: 1 },
      { month: 9, day: 1 },
    ],
  },
  randwijck: {
    opensOn: { month: 3, day: 15 },
    closesOn: { month: 10, day: 31 },
  },
};

export interface SeasonRange {
  /** Short label, e.g. "Spring/Summer 2026". */
  label: string;
  /** Inclusive start date (UTC midnight). */
  startsOn: Date;
  /** Exclusive end date (UTC midnight) — first day NOT covered. */
  endsOn: Date;
}

/* ----------------------------- Date helpers ----------------------------- */

function utc(year: number, monthDay: MonthDay): Date {
  return new Date(Date.UTC(year, monthDay.month - 1, monthDay.day));
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function todayUtc(): Date {
  return startOfDayUtc(new Date());
}

/* ----------------------------- Triaz halves ----------------------------- */

/**
 * Returns the Triaz half ("billing period") that contains `date`.
 *
 * The two halves are anchored on the pivots in {@link SEASON_CONFIG}.
 * Spring half = first pivot → second pivot, named after the second pivot's
 * year. Autumn half = second pivot → first pivot of the next year, named
 * after both years (e.g. "Sep 2026 – Apr 2027").
 */
export function currentTriazHalf(date: Date = todayUtc()): SeasonRange {
  const today = startOfDayUtc(date);
  const year = today.getUTCFullYear();
  const [spring, autumn] = SEASON_CONFIG.triaz.halfPivots;

  const springStart = utc(year, spring);
  const autumnStart = utc(year, autumn);
  const nextSpringStart = utc(year + 1, spring);
  const prevAutumnStart = utc(year - 1, autumn);

  if (today < springStart) {
    return {
      label: `${shortMonth(autumn.month)} ${year - 1} – ${shortMonth(spring.month)} ${year}`,
      startsOn: prevAutumnStart,
      endsOn: springStart,
    };
  }
  if (today < autumnStart) {
    return {
      label: `${shortMonth(spring.month)} – ${shortMonth(autumn.month)} ${year}`,
      startsOn: springStart,
      endsOn: autumnStart,
    };
  }
  return {
    label: `${shortMonth(autumn.month)} ${year} – ${shortMonth(spring.month)} ${year + 1}`,
    startsOn: autumnStart,
    endsOn: nextSpringStart,
  };
}

/* --------------------------- Randwijck season --------------------------- */

export interface RandwijckStatus {
  /** True if Randwijck is currently in season. */
  isOpen: boolean;
  /** Current season range when open, otherwise the next upcoming one. */
  current?: SeasonRange;
  /** Always populated — the next time Randwijck will be open. */
  upcoming: SeasonRange;
}

export function randwijckStatusOn(date: Date = todayUtc()): RandwijckStatus {
  const today = startOfDayUtc(date);
  const year = today.getUTCFullYear();
  const { opensOn, closesOn } = SEASON_CONFIG.randwijck;

  const thisOpen = utc(year, opensOn);
  // closesOn is the last playable day; treat the season range as exclusive
  // on `endsOn` to match Triaz, so add 1 day.
  const thisClose = addDays(utc(year, closesOn), 1);
  const nextOpen = utc(year + 1, opensOn);
  const nextClose = addDays(utc(year + 1, closesOn), 1);

  if (today < thisOpen) {
    return {
      isOpen: false,
      upcoming: {
        label: `Randwijck ${shortMonth(opensOn.month)} – ${shortMonth(closesOn.month)} ${year}`,
        startsOn: thisOpen,
        endsOn: thisClose,
      },
    };
  }
  if (today < thisClose) {
    const range: SeasonRange = {
      label: `Randwijck ${shortMonth(opensOn.month)} – ${shortMonth(closesOn.month)} ${year}`,
      startsOn: thisOpen,
      endsOn: thisClose,
    };
    return { isOpen: true, current: range, upcoming: range };
  }
  return {
    isOpen: false,
    upcoming: {
      label: `Randwijck ${shortMonth(opensOn.month)} – ${shortMonth(closesOn.month)} ${year + 1}`,
      startsOn: nextOpen,
      endsOn: nextClose,
    },
  };
}

/** True if `slug` is currently sellable / playable on `date`. */
export function clubAvailableOn(slug: ClubSlug, date: Date = todayUtc()): boolean {
  if (slug === "triaz") return true; // year-round
  return randwijckStatusOn(date).isOpen;
}

/* ------------------------- Membership end date ------------------------- */

/**
 * Returns the canonical end date for a new membership purchased today,
 * given which clubs it covers.
 *
 *   - Triaz-only: end of the current Triaz half.
 *   - Randwijck included: end of whichever season ends FIRST (we don't
 *     want to charge for time on a closed Randwijck). The customer can
 *     buy the next half when it starts.
 */
export function newMembershipEndsOn(args: {
  clubs: ClubSlug[];
  date?: Date;
}): Date {
  const date = args.date ?? todayUtc();
  const triaz = currentTriazHalf(date);
  if (!args.clubs.includes("randwijck")) return triaz.endsOn;
  const randwijck = randwijckStatusOn(date);
  if (!randwijck.current) {
    // Shouldn't happen — caller should have gated on `clubAvailableOn`,
    // but if Randwijck is closed we fall back to the Triaz half end.
    return triaz.endsOn;
  }
  return triaz.endsOn < randwijck.current.endsOn
    ? triaz.endsOn
    : randwijck.current.endsOn;
}

/* ------------------------------- Calendar ------------------------------- */

export interface CalendarBand {
  slug: ClubSlug | "joint";
  label: string;
  /** Floating-point month index where the band starts, 0..12. */
  startMonth: number;
  /** Floating-point month index where the band ends, 0..12. */
  endMonth: number;
  variant: "triaz-spring" | "triaz-autumn" | "randwijck";
}

/**
 * Bands used by `<SeasonCalendar />` — a flat description of where each
 * club is in season across the months of the chart's calendar year.
 *
 * Triaz is always two bands (the two halves), Randwijck is one band.
 * The wraparound for Triaz's autumn half is split into two bands so it
 * renders correctly within a single Jan–Dec strip.
 */
export function calendarBandsForYear(year: number): CalendarBand[] {
  const [spring, autumn] = SEASON_CONFIG.triaz.halfPivots;
  const { opensOn, closesOn } = SEASON_CONFIG.randwijck;
  const springStart = monthIndex(spring);
  const autumnStart = monthIndex(autumn);

  return [
    {
      slug: "triaz",
      label: "Triaz · spring/summer half",
      startMonth: springStart,
      endMonth: autumnStart,
      variant: "triaz-spring",
    },
    {
      slug: "triaz",
      label: "Triaz · autumn/winter half",
      startMonth: autumnStart,
      endMonth: 12,
      variant: "triaz-autumn",
    },
    {
      slug: "triaz",
      label: "Triaz · autumn/winter half (cont.)",
      startMonth: 0,
      endMonth: springStart,
      variant: "triaz-autumn",
    },
    {
      slug: "randwijck",
      label: "Randwijck open",
      startMonth: monthIndex(opensOn),
      // closesOn is the last playable day; +1 day so the bar visually
      // includes that day.
      endMonth: monthIndex(closesOn) + 1 / 30,
      variant: "randwijck",
    },
  ];
}

/** Floating-point month position of a MonthDay within a 12-month strip. */
function monthIndex(md: MonthDay): number {
  // Approximate days in month using 30 — good enough for visual layout.
  return md.month - 1 + (md.day - 1) / 30;
}

/** Where "today" sits on the 0..12 month axis. */
export function todayOnCalendar(date: Date = todayUtc()): number {
  return date.getUTCMonth() + (date.getUTCDate() - 1) / 30;
}

/* ------------------------------ Formatters ------------------------------ */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const MONTH_LABELS_SHORT = MONTHS_SHORT;

function shortMonth(month: number): string {
  return MONTHS_SHORT[(month - 1 + 12) % 12];
}

export function formatLongDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
