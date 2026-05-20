import {
  amsterdamDayOfWeek,
  amsterdamHourUtc,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/booking/time";

/**
 * Pure helpers for the adult ladder. No DB/Prisma here — the actions and
 * pages compose these into rule checks. Keeping the math in one file
 * makes it trivial to unit-test position swaps and slot intersections
 * later.
 */

// ---------------------------------------------------------------------------
// Challenge range
// ---------------------------------------------------------------------------

/**
 * Can `viewerPosition` issue a challenge to `targetPosition` in a season
 * that allows challenges within ±`range` positions?
 *
 *   - Self-challenge is never allowed.
 *   - The range is symmetric: position 5 can challenge 2..8 with range=3.
 *   - Position 1 can still be challenged by 2..(1+range), but cannot
 *     challenge anyone (already top).
 */
export function isWithinChallengeRange(args: {
  viewerPosition: number;
  targetPosition: number;
  range: number;
}): boolean {
  if (args.viewerPosition === args.targetPosition) return false;
  return Math.abs(args.viewerPosition - args.targetPosition) <= args.range;
}

// ---------------------------------------------------------------------------
// Position swap on upset
// ---------------------------------------------------------------------------

export interface SwapInput {
  challengerPosition: number;
  opponentPosition: number;
  /** Did the challenger win the match? */
  challengerWon: boolean;
}

export interface SwapResult {
  /** True if positions should be swapped as a result of this match. */
  swap: boolean;
  /** New (challengerPosition, opponentPosition) tuple after applying. */
  newChallengerPosition: number;
  newOpponentPosition: number;
}

/**
 * Classic challenge-ladder rule:
 *   - If a *lower-ranked* (higher position number) player wins against a
 *     higher-ranked one, they swap spots.
 *   - In every other case (favourite wins; or higher-ranked challenger
 *     wins down) positions stay put — only stats change.
 */
export function computeSwap(input: SwapInput): SwapResult {
  const { challengerPosition, opponentPosition, challengerWon } = input;
  const winnerPos = challengerWon ? challengerPosition : opponentPosition;
  const loserPos = challengerWon ? opponentPosition : challengerPosition;

  // Winner must currently be ranked *below* (higher number) the loser
  // for there to be a swap.
  if (winnerPos > loserPos) {
    return {
      swap: true,
      newChallengerPosition: opponentPosition,
      newOpponentPosition: challengerPosition,
    };
  }
  return {
    swap: false,
    newChallengerPosition: challengerPosition,
    newOpponentPosition: opponentPosition,
  };
}

// ---------------------------------------------------------------------------
// Score parsing
// ---------------------------------------------------------------------------

export interface SetScore {
  /** Games won by the challenger in this set. */
  a: number;
  /** Games won by the opponent in this set. */
  b: number;
}

/**
 * Best-of-3 sets, simple validation:
 *   - 2 or 3 sets played.
 *   - Each side at most 7 games per set, at least 0.
 *   - One side ends with 2 sets won.
 */
export function summarizeScore(sets: SetScore[]): {
  ok: boolean;
  challengerSets: number;
  opponentSets: number;
  challengerWon?: boolean;
  error?: string;
} {
  if (sets.length < 2 || sets.length > 3) {
    return {
      ok: false,
      challengerSets: 0,
      opponentSets: 0,
      error: "Enter 2 or 3 sets.",
    };
  }
  let cs = 0;
  let os = 0;
  for (const s of sets) {
    if (
      typeof s.a !== "number" ||
      typeof s.b !== "number" ||
      s.a < 0 ||
      s.b < 0 ||
      s.a > 7 ||
      s.b > 7 ||
      s.a === s.b
    ) {
      return {
        ok: false,
        challengerSets: 0,
        opponentSets: 0,
        error: "Each set needs distinct game counts between 0 and 7.",
      };
    }
    if (s.a > s.b) cs++;
    else os++;
  }
  if (cs !== 2 && os !== 2) {
    return {
      ok: false,
      challengerSets: cs,
      opponentSets: os,
      error: "One side must win 2 sets.",
    };
  }
  return {
    ok: true,
    challengerSets: cs,
    opponentSets: os,
    challengerWon: cs === 2,
  };
}

// ---------------------------------------------------------------------------
// Availability windows (day-of-week + minute-of-day)
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  /** 0=Mon..6=Sun (matches `amsterdamDayOfWeek`). */
  dayOfWeek: number;
  /** Minute-of-day (Europe/Amsterdam local), inclusive. */
  startMinute: number;
  /** Minute-of-day (Europe/Amsterdam local), exclusive. */
  endMinute: number;
  /** Optional club preference. Null = either club is fine. */
  clubId?: string | null;
}

/**
 * Intersect two availability windows for the same day-of-week. Returns
 * the overlapping minute range or null if they don't overlap.
 */
export function intersectWindows(
  a: AvailabilityWindow,
  b: AvailabilityWindow,
): { startMinute: number; endMinute: number } | null {
  if (a.dayOfWeek !== b.dayOfWeek) return null;
  const start = Math.max(a.startMinute, b.startMinute);
  const end = Math.min(a.endMinute, b.endMinute);
  if (end - start <= 0) return null;
  return { startMinute: start, endMinute: end };
}

/**
 * For two players' availability arrays, find every overlapping window
 * (per day) where a one-hour booking could fit. Returns each overlap
 * with the candidate start minutes (on-the-hour, every 60 minutes).
 */
export interface OverlapSlot {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export function findOverlaps(
  a: AvailabilityWindow[],
  b: AvailabilityWindow[],
  minDurationMinutes = 60,
): OverlapSlot[] {
  const out: OverlapSlot[] = [];
  for (const wa of a) {
    for (const wb of b) {
      const x = intersectWindows(wa, wb);
      if (!x) continue;
      if (x.endMinute - x.startMinute < minDurationMinutes) continue;
      out.push({
        dayOfWeek: wa.dayOfWeek,
        startMinute: x.startMinute,
        endMinute: x.endMinute,
      });
    }
  }
  out.sort(
    (l, r) =>
      l.dayOfWeek - r.dayOfWeek || l.startMinute - r.startMinute,
  );
  return out;
}

// ---------------------------------------------------------------------------
// Proposed slots — concrete UTC instants for the next N weeks
// ---------------------------------------------------------------------------

/**
 * Given an overlap (day-of-week + minute-range) compute the next K
 * concrete on-the-hour starting moments (UTC) that fall inside the
 * overlap, looking forward from `from`. Used by the challenge UI to
 * propose specific dates ("Sat 11 May 12:00", "Sat 18 May 13:00", …).
 */
export function nextProposedStarts(
  overlap: OverlapSlot,
  opts: {
    from?: Date;
    weeks?: number;
    /** Force on-the-hour (mod 60). True = only HH:00 starts. */
    onTheHour?: boolean;
    durationMinutes?: number;
  } = {},
): Date[] {
  const from = opts.from ?? new Date();
  const weeks = opts.weeks ?? 4;
  const duration = opts.durationMinutes ?? 60;
  const onlyHour = opts.onTheHour ?? true;

  const out: Date[] = [];
  // Walk forward day-by-day until we've covered `weeks` weeks.
  for (let i = 0; i < weeks * 7; i++) {
    const probe = new Date(from.getTime() + i * 24 * 60 * 60_000);
    if (amsterdamDayOfWeek(probe) !== overlap.dayOfWeek) continue;
    const localDateStr = formatLocalDate(probe);
    const { year, month, day } = parseLocalDate(localDateStr);
    const stride = onlyHour ? 60 : 30;
    for (
      let m = roundUp(overlap.startMinute, stride);
      m + duration <= overlap.endMinute;
      m += stride
    ) {
      const startUtc = amsterdamHourUtc(
        year,
        month,
        day,
        Math.floor(m / 60),
        m % 60,
      );
      // Skip slots that are in the past for the very first matching day.
      if (startUtc.getTime() <= from.getTime()) continue;
      out.push(startUtc);
    }
  }
  return out;
}

function roundUp(value: number, stride: number): number {
  const r = value % stride;
  return r === 0 ? value : value + (stride - r);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const DAY_OF_WEEK_LABEL = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export function formatMinuteOfDay(m: number): string {
  const hh = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
