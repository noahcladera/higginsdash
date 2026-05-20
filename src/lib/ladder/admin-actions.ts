"use server";

/**
 * Admin-only ladder actions: open / close seasons and resolve disputes.
 * Kept separate from the member-facing actions so the auth gate is
 * unambiguous (every action here calls `requireAdmin()` first).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { computeSwap } from "./rules";

export type AdminActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

const CreateSeasonSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  joinDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  entryFeeCents: z.coerce.number().int().min(0).max(100_000).default(1500),
  challengeRange: z.coerce.number().int().min(1).max(20).default(3),
  notes: z.string().max(500).optional(),
});

export async function createSeason(
  raw: unknown,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = CreateSeasonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid season.",
    };
  }
  const data = parsed.data;
  if (data.startsOn >= data.endsOn) {
    return { ok: false, error: "End date must be after start date." };
  }

  try {
    const season = await prisma.ladderSeason.create({
      data: {
        name: data.name,
        slug: data.slug,
        startsOn: new Date(`${data.startsOn}T00:00:00Z`),
        endsOn: new Date(`${data.endsOn}T00:00:00Z`),
        joinDeadline:
          data.joinDeadline && data.joinDeadline !== ""
            ? new Date(`${data.joinDeadline}T00:00:00Z`)
            : null,
        entryFeeCents: data.entryFeeCents,
        challengeRange: data.challengeRange,
        notes: data.notes || null,
      },
      select: { id: true },
    });
    revalidatePath("/admin/ladder");
    return { ok: true, id: season.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: "A season with that slug already exists." };
    }
    throw e;
  }
}

export async function activateSeason(
  raw: { seasonId: string },
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = raw?.seasonId;
  if (typeof id !== "string") return { ok: false, error: "Bad request." };
  await prisma.$transaction(async (tx) => {
    await tx.ladderSeason.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await tx.ladderSeason.update({
      where: { id },
      data: { isActive: true },
    });
  });
  revalidatePath("/admin/ladder");
  revalidatePath("/portal/ladder");
  return { ok: true, id };
}

export async function closeSeason(
  raw: { seasonId: string },
): Promise<AdminActionResult> {
  await requireAdmin();
  const id = raw?.seasonId;
  if (typeof id !== "string") return { ok: false, error: "Bad request." };
  await prisma.ladderSeason.update({
    where: { id },
    data: { isActive: false },
  });
  revalidatePath("/admin/ladder");
  revalidatePath("/portal/ladder");
  return { ok: true, id };
}

const UpdateSeasonSchema = CreateSeasonSchema.extend({
  seasonId: z.string().uuid(),
});

/**
 * Edit an existing season's metadata. Doesn't touch entries, matches or
 * the active flag — those have their own actions. Slug remains unique.
 */
export async function updateSeason(
  raw: unknown,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = UpdateSeasonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid season.",
    };
  }
  const data = parsed.data;
  if (data.startsOn >= data.endsOn) {
    return { ok: false, error: "End date must be after start date." };
  }

  try {
    await prisma.ladderSeason.update({
      where: { id: data.seasonId },
      data: {
        name: data.name,
        slug: data.slug,
        startsOn: new Date(`${data.startsOn}T00:00:00Z`),
        endsOn: new Date(`${data.endsOn}T00:00:00Z`),
        joinDeadline:
          data.joinDeadline && data.joinDeadline !== ""
            ? new Date(`${data.joinDeadline}T00:00:00Z`)
            : null,
        entryFeeCents: data.entryFeeCents,
        challengeRange: data.challengeRange,
        notes: data.notes || null,
      },
    });
    revalidatePath("/admin/ladder");
    revalidatePath("/portal/ladder");
    revalidatePath(`/portal/ladder/seasons/${data.seasonId}`);
    return { ok: true, id: data.seasonId };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: "A season with that slug already exists." };
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2025"
    ) {
      return { ok: false, error: "Season not found." };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

const ResolveDisputeSchema = z.object({
  matchId: z.string().uuid(),
  /**
   * "uphold_reporter": keep the originally reported score and close the
   * match (apply swap if upset).
   * "void": cancel the match, restore both stats to pre-report values
   * (we never decremented them, so this is just a status flip).
   * "set_winner": admin overrides — pick one side as the winner without
   * a score (rare; used when both sides agree on outcome but not games).
   */
  action: z.enum(["uphold_reporter", "void", "set_winner"]),
  winnerEntryId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

export async function resolveDispute(
  raw: unknown,
): Promise<AdminActionResult> {
  await requireAdmin();
  const parsed = ResolveDisputeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const input = parsed.data;

  const match = await prisma.ladderMatch.findUnique({
    where: { id: input.matchId },
    include: { challengerEntry: true, opponentEntry: true },
  });
  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "disputed") {
    return { ok: false, error: "Match isn't disputed." };
  }

  if (input.action === "void") {
    await prisma.ladderMatch.update({
      where: { id: match.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: input.note ?? "Voided by office after dispute.",
      },
    });
    revalidatePath("/admin/ladder");
    revalidatePath(`/portal/ladder/matches/${match.id}`);
    revalidatePath("/portal/ladder");
    return { ok: true, id: match.id };
  }

  // Determine the final winner.
  let winnerEntryId: string | null = null;
  if (input.action === "uphold_reporter") {
    if (!match.winnerEntryId) {
      return { ok: false, error: "No winner was reported — use 'set winner'." };
    }
    winnerEntryId = match.winnerEntryId;
  } else {
    if (
      !input.winnerEntryId ||
      (input.winnerEntryId !== match.challengerEntryId &&
        input.winnerEntryId !== match.opponentEntryId)
    ) {
      return { ok: false, error: "Pick a valid winner." };
    }
    winnerEntryId = input.winnerEntryId;
  }

  await prisma.$transaction(async (tx) => {
    const challengerWon = winnerEntryId === match.challengerEntryId;
    const swap = computeSwap({
      challengerPosition: match.challengerEntry.position,
      opponentPosition: match.opponentEntry.position,
      challengerWon,
    });

    await tx.ladderMatch.update({
      where: { id: match.id },
      data: {
        status: "played",
        confirmedAt: new Date(),
        winnerEntryId,
        swapped: swap.swap,
        disputeReason:
          input.note != null ? `${match.disputeReason ?? ""}\nResolved: ${input.note}`.trim() : match.disputeReason,
      },
    });

    if (swap.swap) {
      await tx.ladderEntry.update({
        where: { id: match.challengerEntryId },
        data: { position: -1 },
      });
      await tx.ladderEntry.update({
        where: { id: match.opponentEntryId },
        data: { position: swap.newOpponentPosition },
      });
      await tx.ladderEntry.update({
        where: { id: match.challengerEntryId },
        data: {
          position: swap.newChallengerPosition,
          peakPosition: Math.min(
            match.challengerEntry.peakPosition,
            swap.newChallengerPosition,
          ),
        },
      });
      await tx.ladderEntry.update({
        where: { id: match.opponentEntryId },
        data: {
          peakPosition: Math.min(
            match.opponentEntry.peakPosition,
            swap.newOpponentPosition,
          ),
        },
      });
    }

    const now = new Date();
    await tx.ladderEntry.update({
      where: { id: match.challengerEntryId },
      data: {
        wins: { increment: challengerWon ? 1 : 0 },
        losses: { increment: challengerWon ? 0 : 1 },
        matchesPlayed: { increment: 1 },
        lastPlayedAt: now,
      },
    });
    await tx.ladderEntry.update({
      where: { id: match.opponentEntryId },
      data: {
        wins: { increment: challengerWon ? 0 : 1 },
        losses: { increment: challengerWon ? 1 : 0 },
        matchesPlayed: { increment: 1 },
        lastPlayedAt: now,
      },
    });
  });

  revalidatePath("/admin/ladder");
  revalidatePath(`/portal/ladder/matches/${match.id}`);
  revalidatePath("/portal/ladder");
  return { ok: true, id: match.id };
}
