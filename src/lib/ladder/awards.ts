import { prisma } from "@/lib/prisma";
import { CLUB_TZ } from "@/lib/booking/time";

/**
 * Monthly awards: MVP (most wins), Most Improved (biggest position climb),
 * Iron Man (most matches played). Computed on demand at page load and
 * persisted as `LadderAward` rows so past months stay stable even after
 * positions move.
 *
 * Cheap aggregate over `LadderMatch` (one query per month) — totally fine
 * to call on every render of the ladder home page.
 */

export type LadderAwardKind = "mvp" | "most_improved" | "iron_man";

export interface LadderAwardRow {
  kind: LadderAwardKind;
  personId: string;
  firstName: string;
  lastName: string;
  /** "Wins" / "Spots climbed" / "Matches" depending on kind. */
  metricLabel: string;
  metricValue: number;
}

/**
 * Compute the awards for a given (season, month) on the fly. Returns at
 * most 1 row per kind. Skips a kind when there's no qualifying data
 * (e.g. nobody played a match yet → no MVP).
 */
export async function computeAwardsForMonth(args: {
  seasonId: string;
  month: Date;
}): Promise<LadderAwardRow[]> {
  const { start, end } = monthBounds(args.month);

  // Pull every match played and confirmed within the month (status =
  // 'played'), with both entries' positions as of right now (good
  // enough for current-month stats; historical months stay stable
  // because we persist the row once computed).
  const matches = await prisma.ladderMatch.findMany({
    where: {
      seasonId: args.seasonId,
      status: "played",
      confirmedAt: { gte: start, lt: end },
    },
    include: {
      challengerEntry: {
        include: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
      opponentEntry: {
        include: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (matches.length === 0) return [];

  // Per-person tallies.
  const winsByPerson = new Map<string, number>();
  const playedByPerson = new Map<string, number>();
  const personDisplay = new Map<
    string,
    { firstName: string; lastName: string }
  >();

  for (const m of matches) {
    const cId = m.challengerEntry.personId;
    const oId = m.opponentEntry.personId;
    personDisplay.set(cId, m.challengerEntry.person);
    personDisplay.set(oId, m.opponentEntry.person);
    playedByPerson.set(cId, (playedByPerson.get(cId) ?? 0) + 1);
    playedByPerson.set(oId, (playedByPerson.get(oId) ?? 0) + 1);
    if (m.winnerEntryId === m.challengerEntryId) {
      winsByPerson.set(cId, (winsByPerson.get(cId) ?? 0) + 1);
    } else if (m.winnerEntryId === m.opponentEntryId) {
      winsByPerson.set(oId, (winsByPerson.get(oId) ?? 0) + 1);
    }
  }

  const out: LadderAwardRow[] = [];

  // MVP — most wins (ties broken by playedByPerson desc, then alpha).
  const mvp = pickTop(winsByPerson, playedByPerson, personDisplay);
  if (mvp && mvp.value > 0) {
    out.push({
      kind: "mvp",
      personId: mvp.personId,
      firstName: mvp.firstName,
      lastName: mvp.lastName,
      metricLabel: mvp.value === 1 ? "win" : "wins",
      metricValue: mvp.value,
    });
  }

  // Iron Man — most matches played.
  const iron = pickTop(playedByPerson, winsByPerson, personDisplay);
  if (iron && iron.value > 0) {
    out.push({
      kind: "iron_man",
      personId: iron.personId,
      firstName: iron.firstName,
      lastName: iron.lastName,
      metricLabel: iron.value === 1 ? "match" : "matches",
      metricValue: iron.value,
    });
  }

  // Most Improved — largest (startPosition - currentPosition) for active
  // entries who played at least one match this month.
  const personIds = Array.from(playedByPerson.keys());
  const entries = await prisma.ladderEntry.findMany({
    where: {
      seasonId: args.seasonId,
      personId: { in: personIds },
    },
    include: {
      person: { select: { firstName: true, lastName: true } },
    },
  });
  let bestEntry: (typeof entries)[number] | null = null;
  let bestDelta = 0;
  for (const e of entries) {
    const delta = e.startPosition - e.position;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestEntry = e;
    }
  }
  if (bestEntry && bestDelta > 0) {
    out.push({
      kind: "most_improved",
      personId: bestEntry.personId,
      firstName: bestEntry.person.firstName,
      lastName: bestEntry.person.lastName,
      metricLabel: bestDelta === 1 ? "spot climbed" : "spots climbed",
      metricValue: bestDelta,
    });
  }

  return out;
}

/**
 * Persist computed awards for a *past* month so they're frozen forever.
 * Idempotent — uses the unique (seasonId, month, kind) index.
 */
export async function persistAwardsIfPastMonth(args: {
  seasonId: string;
  month: Date;
  rows: LadderAwardRow[];
}) {
  const now = new Date();
  const { end } = monthBounds(args.month);
  if (end > now) return; // current/future month — keep recomputing live.

  for (const r of args.rows) {
    await prisma.ladderAward.upsert({
      where: {
        seasonId_month_kind: {
          seasonId: args.seasonId,
          month: monthBounds(args.month).start,
          kind: r.kind,
        },
      },
      create: {
        seasonId: args.seasonId,
        month: monthBounds(args.month).start,
        kind: r.kind,
        personId: r.personId,
        metricValue: r.metricValue,
      },
      update: {
        personId: r.personId,
        metricValue: r.metricValue,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function monthBounds(d: Date): { start: Date; end: Date } {
  // Anchor to the first day of the month in the club's local TZ — keeps
  // the awards aligned with how members think about months.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ,
    year: "numeric",
    month: "2-digit",
  });
  const [yyyy, mm] = fmt.format(d).split("-").map(Number);
  const start = new Date(Date.UTC(yyyy, mm - 1, 1));
  const end = new Date(Date.UTC(mm === 12 ? yyyy + 1 : yyyy, mm % 12, 1));
  return { start, end };
}

function pickTop(
  primary: Map<string, number>,
  tiebreaker: Map<string, number>,
  displayMap: Map<string, { firstName: string; lastName: string }>,
): {
  personId: string;
  value: number;
  firstName: string;
  lastName: string;
} | null {
  let bestId: string | null = null;
  let bestVal = -1;
  let bestTb = -1;
  for (const [pid, v] of primary) {
    const tb = tiebreaker.get(pid) ?? 0;
    const display = displayMap.get(pid);
    if (!display) continue;
    if (v > bestVal || (v === bestVal && tb > bestTb)) {
      bestId = pid;
      bestVal = v;
      bestTb = tb;
    }
  }
  if (!bestId) return null;
  const display = displayMap.get(bestId)!;
  return {
    personId: bestId,
    value: bestVal,
    firstName: display.firstName,
    lastName: display.lastName,
  };
}
