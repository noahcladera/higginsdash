import { prisma } from "@/lib/prisma";
import type { Prisma, LadderMatchStatus } from "@prisma/client";

/**
 * Read-side helpers for the ladder UI. Centralised so the home page,
 * challenge picker, and individual match page all reference one shape.
 *
 * The leaderboard is rendered every page load so we keep the queries
 * narrow (no relations beyond what the UI prints) and rely on the
 * `(season_id, position)` and `(season_id, status)` indexes from the
 * migration.
 */

export interface LadderLeaderboardRow {
  entryId: string;
  position: number;
  startPosition: number;
  peakPosition: number;
  status: "active" | "withdrawn";
  wins: number;
  losses: number;
  matchesPlayed: number;
  lastPlayedAt: Date | null;
  person: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export async function getActiveSeason() {
  return prisma.ladderSeason.findFirst({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
  });
}

export async function getLeaderboard(seasonId: string): Promise<LadderLeaderboardRow[]> {
  const rows = await prisma.ladderEntry.findMany({
    where: { seasonId },
    orderBy: { position: "asc" },
    include: {
      person: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((r) => ({
    entryId: r.id,
    position: r.position,
    startPosition: r.startPosition,
    peakPosition: r.peakPosition,
    status: r.status,
    wins: r.wins,
    losses: r.losses,
    matchesPlayed: r.matchesPlayed,
    lastPlayedAt: r.lastPlayedAt,
    person: r.person,
  }));
}

export interface LadderRecentMatch {
  id: string;
  status: string;
  scheduledAt: Date | null;
  confirmedAt: Date | null;
  swapped: boolean;
  challenger: { firstName: string; lastName: string; position: number };
  opponent: { firstName: string; lastName: string; position: number };
  winnerSide: "challenger" | "opponent" | null;
  scoreText: string | null;
}

export async function getRecentMatches(args: {
  seasonId: string;
  limit?: number;
  status?: LadderMatchStatus[];
}): Promise<LadderRecentMatch[]> {
  const matches = await prisma.ladderMatch.findMany({
    where: {
      seasonId: args.seasonId,
      ...(args.status ? { status: { in: args.status } } : {}),
    },
    orderBy: [{ confirmedAt: "desc" }, { scheduledAt: "desc" }, { createdAt: "desc" }],
    take: args.limit ?? 8,
    include: {
      challengerEntry: {
        include: { person: { select: { firstName: true, lastName: true } } },
      },
      opponentEntry: {
        include: { person: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  return matches.map((m) => {
    const winnerSide: LadderRecentMatch["winnerSide"] = m.winnerEntryId
      ? m.winnerEntryId === m.challengerEntryId
        ? "challenger"
        : "opponent"
      : null;
    return {
      id: m.id,
      status: m.status,
      scheduledAt: m.scheduledAt,
      confirmedAt: m.confirmedAt,
      swapped: m.swapped,
      challenger: {
        firstName: m.challengerEntry.person.firstName,
        lastName: m.challengerEntry.person.lastName,
        position: m.challengerEntry.position,
      },
      opponent: {
        firstName: m.opponentEntry.person.firstName,
        lastName: m.opponentEntry.person.lastName,
        position: m.opponentEntry.position,
      },
      winnerSide,
      scoreText: formatScore(m.scoreJson),
    };
  });
}

export async function getMatchesInvolving(args: {
  seasonId: string;
  entryId: string;
  status?: LadderMatchStatus[];
  limit?: number;
}) {
  return prisma.ladderMatch.findMany({
    where: {
      seasonId: args.seasonId,
      OR: [
        { challengerEntryId: args.entryId },
        { opponentEntryId: args.entryId },
      ],
      ...(args.status ? { status: { in: args.status } } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: args.limit ?? 20,
    include: {
      challengerEntry: {
        include: { person: { select: { firstName: true, lastName: true } } },
      },
      opponentEntry: {
        include: { person: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

export async function getMyEntry(args: {
  seasonId: string;
  personId: string;
}) {
  return prisma.ladderEntry.findUnique({
    where: {
      seasonId_personId: { seasonId: args.seasonId, personId: args.personId },
    },
    include: { availability: true },
  });
}

function formatScore(json: Prisma.JsonValue | null): string | null {
  if (!Array.isArray(json)) return null;
  const sets = json as { a?: unknown; b?: unknown }[];
  const parts: string[] = [];
  for (const s of sets) {
    const a = typeof s.a === "number" ? s.a : null;
    const b = typeof s.b === "number" ? s.b : null;
    if (a == null || b == null) return null;
    parts.push(`${a}–${b}`);
  }
  return parts.length === 0 ? null : parts.join(", ");
}
