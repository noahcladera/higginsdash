"use server";

/**
 * Server actions for the adult ladder.
 *
 *   - joinLadder()              → pay the entry fee + add to the bottom of the active season.
 *   - setAvailability(windows)  → replace the caller's availability rows.
 *   - proposeMatch(...)         → challenger picks an opponent + proposes slots.
 *   - respondToMatch(...)       → opponent accepts/declines; on accept we
 *                                 auto-book the court via createBooking().
 *   - reportScore(...)          → either side reports; opponent confirms.
 *   - confirmScore(...)         → opponent confirms (or disputes); applies swap.
 *   - withdrawFromLadder()
 *
 * Every action runs `getLadderEligibility()` again as defense in depth so
 * a hand-crafted POST can't bypass the UI gate.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getLadderEligibility } from "./eligibility";
import {
  computeSwap,
  isWithinChallengeRange,
  summarizeScore,
  type SetScore,
} from "./rules";
import { createBooking } from "@/lib/booking/actions";
import { formatLocalDate, formatLocalHour } from "@/lib/booking/time";
import { withSerializableRetry } from "@/lib/db/serializable";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

// ---------------------------------------------------------------------------
// Common types + auth resolver
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

interface Actor {
  personId: string;
  householdId: string | null;
  email: string | null;
  fullName: string;
}

async function resolveActor(): Promise<Actor> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const person = await prisma.person.findUnique({
    where: { id: user.id },
    include: {
      householdMember: { select: { householdId: true } },
      emails: { where: { isPrimary: true }, take: 1 },
    },
  });
  if (!person || person.archivedAt) throw new Error("Account inactive.");

  return {
    personId: person.id,
    householdId: person.householdMember?.householdId ?? null,
    email: person.emails[0]?.address ?? user.email ?? null,
    fullName: `${person.firstName} ${person.lastName}`.trim() || "Member",
  };
}

async function getActiveSeasonOrFail() {
  const season = await prisma.ladderSeason.findFirst({
    where: { isActive: true },
    orderBy: { startsOn: "desc" },
  });
  if (!season) {
    throw new Error("No active ladder season right now — check back soon.");
  }
  return season;
}

async function getMyEntryOrFail(personId: string, seasonId: string) {
  const entry = await prisma.ladderEntry.findUnique({
    where: { seasonId_personId: { seasonId, personId } },
  });
  if (!entry || entry.status !== "active") {
    throw new Error("You're not currently in the ladder.");
  }
  return entry;
}

// ---------------------------------------------------------------------------
// joinLadder
// ---------------------------------------------------------------------------

/**
 * Add the caller to the bottom of the active season's ladder. Creates a
 * Payment row for the entry fee (status `pending`) — the real Mollie
 * handoff is wired in later. For free seasons (`entryFeeCents = 0`) the
 * payment row is skipped.
 *
 * Re-joining after withdrawing flips the status back to `active` at the
 * bottom of the ladder.
 */
export async function joinLadder(): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const eligibility = await getLadderEligibility({
    personId: actor.personId,
    householdId: actor.householdId,
  });
  if (!eligibility.eligible) {
    return {
      ok: false,
      error: "Adult Triaz membership required to join the ladder.",
    };
  }

  let season;
  try {
    season = await getActiveSeasonOrFail();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (season.joinDeadline && season.joinDeadline.getTime() < Date.now()) {
    return {
      ok: false,
      error: "The deadline to join this season has passed.",
    };
  }

  // Create entry at the bottom of the ladder (largest position + 1).
  // Wrapped in a Serializable txn (with retry) so two parallel joiners
  // can't both compute the same `nextPosition` and race the
  // `@@unique([seasonId, position])` constraint into a P2002 crash.
  const entryId = await withSerializableRetry(async (tx) => {
    const existing = await tx.ladderEntry.findUnique({
      where: {
        seasonId_personId: { seasonId: season.id, personId: actor.personId },
      },
    });

    if (existing && existing.status === "active") {
      return existing.id;
    }

    const last = await tx.ladderEntry.findFirst({
      where: { seasonId: season.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const nextPosition = (last?.position ?? 0) + 1;

    let paymentId: string | null = null;
    if (season.entryFeeCents > 0) {
      const payment = await tx.payment.create({
        data: {
          amount: new Prisma.Decimal(season.entryFeeCents).div(100),
          currency: "EUR",
          status: "pending",
          description: `Adult ladder entry — ${season.name}`,
          paidByPersonId: actor.personId,
          paidByHouseholdId: actor.householdId,
        },
        select: { id: true },
      });
      paymentId = payment.id;
    }

    if (existing) {
      const reactivated = await tx.ladderEntry.update({
        where: { id: existing.id },
        data: {
          status: "active",
          withdrawnAt: null,
          position: nextPosition,
          startPosition: nextPosition,
          peakPosition: nextPosition,
          paymentId: paymentId ?? existing.paymentId,
        },
        select: { id: true },
      });
      return reactivated.id;
    }

    const created = await tx.ladderEntry.create({
      data: {
        seasonId: season.id,
        personId: actor.personId,
        position: nextPosition,
        startPosition: nextPosition,
        peakPosition: nextPosition,
        paymentId,
      },
      select: { id: true },
    });
    return created.id;
  });

  if (actor.email) {
    await sendEmail({
      to: actor.email,
      subject: `Welcome to the ${season.name} ladder`,
      body:
        season.entryFeeCents > 0
          ? `You're in! The €${(season.entryFeeCents / 100).toFixed(0)} entry fee will be confirmed by email when payment clears. Set your availability to start matching.`
          : "You're in! Set your availability to start matching.",
    });
  }

  revalidatePath("/portal/ladder");
  revalidatePath("/portal");
  return { ok: true, id: entryId };
}

// ---------------------------------------------------------------------------
// setAvailability
// ---------------------------------------------------------------------------

const AvailabilitySchema = z.object({
  windows: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(24 * 60 - 1),
        endMinute: z.number().int().min(1).max(24 * 60),
        clubId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(20),
});

export type SetAvailabilityInput = z.input<typeof AvailabilitySchema>;

export async function setAvailability(
  raw: SetAvailabilityInput,
): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = AvailabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid availability.",
    };
  }
  for (const w of parsed.data.windows) {
    if (w.endMinute <= w.startMinute) {
      return { ok: false, error: "Each window's end must be after its start." };
    }
  }

  const season = await getActiveSeasonOrFail().catch((e: Error) => e);
  if (season instanceof Error) return { ok: false, error: season.message };

  const entry = await getMyEntryOrFail(actor.personId, season.id).catch(
    (e: Error) => e,
  );
  if (entry instanceof Error) return { ok: false, error: entry.message };

  await prisma.$transaction(async (tx) => {
    await tx.ladderAvailability.deleteMany({ where: { entryId: entry.id } });
    if (parsed.data.windows.length > 0) {
      await tx.ladderAvailability.createMany({
        data: parsed.data.windows.map((w) => ({
          entryId: entry.id,
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          clubId: w.clubId ?? null,
        })),
      });
    }
  });

  revalidatePath("/portal/ladder");
  revalidatePath("/portal/ladder/challenge");
  return { ok: true, id: entry.id };
}

// ---------------------------------------------------------------------------
// proposeMatch
// ---------------------------------------------------------------------------

const ProposeMatchSchema = z.object({
  opponentEntryId: z.string().uuid(),
  /** ISO 8601 UTC instants the challenger is offering. */
  proposedSlotsUtc: z.array(z.string().datetime()).min(1).max(5),
  /** Court the challenger would like to play on (already filtered by club). */
  courtId: z.string().uuid().optional(),
});

export type ProposeMatchInput = z.input<typeof ProposeMatchSchema>;

export async function proposeMatch(
  raw: ProposeMatchInput,
): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = ProposeMatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid proposal.",
    };
  }
  const input = parsed.data;

  const eligibility = await getLadderEligibility({
    personId: actor.personId,
    householdId: actor.householdId,
  });
  if (!eligibility.eligible) {
    return { ok: false, error: "You can't issue challenges right now." };
  }

  const season = await getActiveSeasonOrFail().catch((e: Error) => e);
  if (season instanceof Error) return { ok: false, error: season.message };

  const me = await getMyEntryOrFail(actor.personId, season.id).catch(
    (e: Error) => e,
  );
  if (me instanceof Error) return { ok: false, error: me.message };

  const opponent = await prisma.ladderEntry.findUnique({
    where: { id: input.opponentEntryId },
    include: { person: { select: { firstName: true, lastName: true, emails: { where: { isPrimary: true }, take: 1 } } } },
  });
  if (!opponent || opponent.seasonId !== season.id) {
    return { ok: false, error: "Opponent not found." };
  }
  if (opponent.id === me.id) {
    return { ok: false, error: "You can't challenge yourself." };
  }
  if (opponent.status !== "active") {
    return { ok: false, error: "That player has withdrawn from the ladder." };
  }
  if (
    !isWithinChallengeRange({
      viewerPosition: me.position,
      targetPosition: opponent.position,
      range: season.challengeRange,
    })
  ) {
    return {
      ok: false,
      error: `You can only challenge players within ±${season.challengeRange} positions.`,
    };
  }

  // One open challenge per player at a time (in either direction).
  const existingOpen = await prisma.ladderMatch.findFirst({
    where: {
      seasonId: season.id,
      status: { in: ["awaiting_opponent", "scheduled", "awaiting_confirmation"] },
      OR: [
        { challengerEntryId: me.id },
        { opponentEntryId: me.id },
      ],
    },
    select: { id: true, status: true },
  });
  if (existingOpen) {
    return {
      ok: false,
      error: "You already have an open match. Finish or cancel it first.",
    };
  }

  const slots = input.proposedSlotsUtc.map((s) => new Date(s));
  if (slots.some((d) => Number.isNaN(d.getTime()))) {
    return { ok: false, error: "One of the proposed slots is invalid." };
  }
  if (slots.some((d) => d.getTime() <= Date.now())) {
    return { ok: false, error: "Proposed slots must be in the future." };
  }

  const match = await prisma.ladderMatch.create({
    data: {
      seasonId: season.id,
      challengerEntryId: me.id,
      opponentEntryId: opponent.id,
      status: "awaiting_opponent",
      proposedSlots: slots,
    },
    select: { id: true },
  });

  const opponentEmail = opponent.person.emails[0]?.address;
  if (opponentEmail) {
    const slotList = slots
      .map((d) => `  • ${formatLocalDate(d)} at ${formatLocalHour(d)}`)
      .join("\n");
    await sendEmail({
      to: opponentEmail,
      subject: `${actor.fullName} challenged you on the ladder`,
      body: `Pick a slot to lock in the match:\n${slotList}\n\nGo to /portal/ladder/matches/${match.id} to respond.`,
    });
  }

  revalidatePath("/portal/ladder");
  revalidatePath("/portal/ladder/challenge");
  revalidatePath(`/portal/ladder/matches/${match.id}`);
  return { ok: true, id: match.id };
}

// ---------------------------------------------------------------------------
// respondToMatch
// ---------------------------------------------------------------------------

const RespondSchema = z.object({
  matchId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
  /** ISO 8601 UTC. Must be one of the proposed slots. */
  acceptedSlotUtc: z.string().datetime().optional(),
  /** Court id chosen by the opponent on accept. */
  courtId: z.string().uuid().optional(),
});

export type RespondInput = z.input<typeof RespondSchema>;

export async function respondToMatch(
  raw: RespondInput,
): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = RespondSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const match = await prisma.ladderMatch.findUnique({
    where: { id: input.matchId },
    include: {
      challengerEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, emails: { where: { isPrimary: true }, take: 1 } } },
        },
      },
      opponentEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, emails: { where: { isPrimary: true }, take: 1 } } },
        },
      },
    },
  });
  if (!match) return { ok: false, error: "Match not found." };
  if (match.opponentEntry.personId !== actor.personId) {
    return { ok: false, error: "Only the challenged player can respond." };
  }
  if (match.status !== "awaiting_opponent") {
    return { ok: false, error: "This match is no longer awaiting a response." };
  }

  if (input.action === "decline") {
    await prisma.ladderMatch.update({
      where: { id: match.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: `Declined by ${actor.fullName}`,
      },
    });
    const challengerEmail =
      match.challengerEntry.person.emails[0]?.address;
    if (challengerEmail) {
      await sendEmail({
        to: challengerEmail,
        subject: `Your ladder challenge was declined`,
        body: `${actor.fullName} declined the challenge. You're free to challenge someone else.`,
      });
    }
    revalidatePath("/portal/ladder");
    revalidatePath(`/portal/ladder/matches/${match.id}`);
    return { ok: true, id: match.id };
  }

  // accept path
  if (!input.acceptedSlotUtc) {
    return { ok: false, error: "Pick a slot to accept the challenge." };
  }
  if (!input.courtId) {
    return { ok: false, error: "Pick a court for the match." };
  }
  const acceptedSlot = new Date(input.acceptedSlotUtc);
  const slotIsValid = match.proposedSlots.some(
    (d) => d.getTime() === acceptedSlot.getTime(),
  );
  if (!slotIsValid) {
    return { ok: false, error: "That slot wasn't one of the proposed times." };
  }
  if (acceptedSlot.getTime() <= Date.now()) {
    return { ok: false, error: "Pick a slot in the future." };
  }

  // Auto-book the court via the existing booking action. The opponent
  // is the booker (so the booking lands on their account); the
  // challenger is captured as a partner.
  const challengerName = `${match.challengerEntry.person.firstName} ${match.challengerEntry.person.lastName}`.trim();
  const bookingRes = await createBooking({
    courtId: input.courtId,
    startsAtUtc: acceptedSlot.toISOString(),
    needsLights: false,
    purpose: "personal",
    partners: [
      {
        partnerName: challengerName || "Ladder opponent",
        personId: match.challengerEntry.personId,
      },
    ],
    notes: `Adult ladder match #${match.id.slice(0, 8)}`,
  });
  if (!bookingRes.ok) {
    return {
      ok: false,
      error: `Couldn't auto-book the court: ${bookingRes.error}`,
    };
  }

  await prisma.ladderMatch.update({
    where: { id: match.id },
    data: {
      status: "scheduled",
      scheduledAt: acceptedSlot,
      courtBookingId: bookingRes.bookingId,
    },
  });

  const challengerEmail = match.challengerEntry.person.emails[0]?.address;
  const opponentEmail = match.opponentEntry.person.emails[0]?.address;
  const niceWhen = `${formatLocalDate(acceptedSlot)} at ${formatLocalHour(acceptedSlot)}`;
  if (challengerEmail) {
    await sendEmail({
      to: challengerEmail,
      subject: `Match locked in for ${niceWhen}`,
      body: `${actor.fullName} accepted your challenge. Court is booked. Go play.`,
    });
  }
  if (opponentEmail) {
    await sendEmail({
      to: opponentEmail,
      subject: `Match scheduled for ${niceWhen}`,
      body: `You've accepted the challenge from ${challengerName}. Court is booked.`,
    });
  }

  revalidatePath("/portal/ladder");
  revalidatePath(`/portal/ladder/matches/${match.id}`);
  revalidatePath("/portal/bookings");
  return { ok: true, id: match.id };
}

// ---------------------------------------------------------------------------
// reportScore + confirmScore
// ---------------------------------------------------------------------------

const ScoreSchema = z.object({
  matchId: z.string().uuid(),
  sets: z
    .array(
      z.object({
        a: z.number().int().min(0).max(7),
        b: z.number().int().min(0).max(7),
      }),
    )
    .min(2)
    .max(3),
});

export type ReportScoreInput = z.input<typeof ScoreSchema>;

export async function reportScore(
  raw: ReportScoreInput,
): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = ScoreSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid score." };
  }

  const match = await prisma.ladderMatch.findUnique({
    where: { id: parsed.data.matchId },
    include: {
      challengerEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, emails: { where: { isPrimary: true }, take: 1 } } },
        },
      },
      opponentEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, emails: { where: { isPrimary: true }, take: 1 } } },
        },
      },
    },
  });
  if (!match) return { ok: false, error: "Match not found." };

  const isChallenger = match.challengerEntry.personId === actor.personId;
  const isOpponent = match.opponentEntry.personId === actor.personId;
  if (!isChallenger && !isOpponent) {
    return { ok: false, error: "Only the players can report a score." };
  }
  if (
    match.status !== "scheduled" &&
    match.status !== "awaiting_confirmation"
  ) {
    return { ok: false, error: "This match isn't open for score reporting." };
  }

  // Sets are recorded as challenger-first ("a" = challenger, "b" =
  // opponent). If the opponent enters them they enter their own side
  // first, so we flip before validating.
  const sets: SetScore[] = isOpponent
    ? parsed.data.sets.map((s) => ({ a: s.b, b: s.a }))
    : parsed.data.sets;

  const summary = summarizeScore(sets);
  if (!summary.ok || summary.challengerWon === undefined) {
    return { ok: false, error: summary.error ?? "Invalid score." };
  }

  const winnerEntryId = summary.challengerWon
    ? match.challengerEntryId
    : match.opponentEntryId;

  await prisma.ladderMatch.update({
    where: { id: match.id },
    data: {
      status: "awaiting_confirmation",
      scoreJson: sets as unknown as Prisma.InputJsonValue,
      reportedByPersonId: actor.personId,
      reportedAt: new Date(),
      winnerEntryId,
    },
  });

  const otherEmail = (
    isChallenger
      ? match.opponentEntry.person.emails
      : match.challengerEntry.person.emails
  )[0]?.address;
  if (otherEmail) {
    const scoreText = sets
      .map((s) => `${s.a}-${s.b}`)
      .join(", ");
    await sendEmail({
      to: otherEmail,
      subject: `Score reported: confirm or dispute`,
      body: `${actor.fullName} reported the match as ${scoreText}. Go to /portal/ladder/matches/${match.id} to confirm.`,
    });
  }

  revalidatePath("/portal/ladder");
  revalidatePath(`/portal/ladder/matches/${match.id}`);
  return { ok: true, id: match.id };
}

const ConfirmSchema = z.object({
  matchId: z.string().uuid(),
  action: z.enum(["confirm", "dispute"]),
  disputeReason: z.string().max(500).optional(),
});

export type ConfirmScoreInput = z.input<typeof ConfirmSchema>;

export async function confirmScore(
  raw: ConfirmScoreInput,
): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = ConfirmSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid input." };
  }
  const input = parsed.data;

  const match = await prisma.ladderMatch.findUnique({
    where: { id: input.matchId },
    include: {
      challengerEntry: true,
      opponentEntry: true,
    },
  });
  if (!match) return { ok: false, error: "Match not found." };
  if (match.status !== "awaiting_confirmation") {
    return { ok: false, error: "This match isn't awaiting confirmation." };
  }
  if (
    match.reportedByPersonId === actor.personId ||
    (match.challengerEntry.personId !== actor.personId &&
      match.opponentEntry.personId !== actor.personId)
  ) {
    return {
      ok: false,
      error: "Only the other player can confirm or dispute the score.",
    };
  }

  if (input.action === "dispute") {
    await prisma.ladderMatch.update({
      where: { id: match.id },
      data: {
        status: "disputed",
        disputeReason: input.disputeReason ?? "(no reason given)",
      },
    });
    const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
    if (brand.officeEmail) {
      await sendEmail({
        to: brand.officeEmail,
        subject: `${terms.ladder.singular} dispute on match ${match.id.slice(0, 8)}`,
        body: `${actor.fullName} disputed the reported score. Reason: ${input.disputeReason ?? "(none)"}\nResolve at /admin/ladder.`,
      });
    }
    revalidatePath("/portal/ladder");
    revalidatePath(`/portal/ladder/matches/${match.id}`);
    revalidatePath("/admin/ladder");
    return { ok: true, id: match.id };
  }

  // confirm path: apply position swap if upset, update stats, mark played.
  if (!match.winnerEntryId) {
    return { ok: false, error: "Match is missing a winner — please re-report." };
  }

  await prisma.$transaction(async (tx) => {
    const challengerWon = match.winnerEntryId === match.challengerEntryId;
    const swap = computeSwap({
      challengerPosition: match.challengerEntry.position,
      opponentPosition: match.opponentEntry.position,
      challengerWon,
    });

    const now = new Date();
    await tx.ladderMatch.update({
      where: { id: match.id },
      data: {
        status: "played",
        confirmedAt: now,
        swapped: swap.swap,
      },
    });

    if (swap.swap) {
      // Atomic swap with a temporary positions to avoid the
      // (seasonId, position) unique constraint blowing up.
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
      // Refresh opponent's peak (in case they fell, peak stays unchanged).
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

  revalidatePath("/portal/ladder");
  revalidatePath(`/portal/ladder/matches/${match.id}`);
  return { ok: true, id: match.id };
}

// ---------------------------------------------------------------------------
// withdrawFromLadder
// ---------------------------------------------------------------------------

export async function withdrawFromLadder(): Promise<ActionResult> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const season = await getActiveSeasonOrFail().catch((e: Error) => e);
  if (season instanceof Error) return { ok: false, error: season.message };

  const entry = await prisma.ladderEntry.findUnique({
    where: {
      seasonId_personId: { seasonId: season.id, personId: actor.personId },
    },
  });
  if (!entry || entry.status !== "active") {
    return { ok: false, error: "You're not in the ladder." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.ladderEntry.update({
      where: { id: entry.id },
      data: { status: "withdrawn", withdrawnAt: new Date() },
    });
    // Cancel any open matches involving this entry.
    await tx.ladderMatch.updateMany({
      where: {
        seasonId: season.id,
        status: { in: ["awaiting_opponent", "scheduled", "awaiting_confirmation"] },
        OR: [
          { challengerEntryId: entry.id },
          { opponentEntryId: entry.id },
        ],
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledReason: `${actor.fullName} withdrew from the ladder`,
      },
    });
  });

  revalidatePath("/portal/ladder");
  return { ok: true, id: entry.id };
}
