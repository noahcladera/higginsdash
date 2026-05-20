"use server";

/**
 * Server actions for court bookings: create, cancel, request cancellation
 * (coach-only for coaching bookings), decide cancellation (admin).
 *
 * Auth gate per-action:
 *   - createBooking          → admin | coach | member (must own a household
 *                              with active membership; coaches bypass)
 *   - cancelBooking          → admin | owner (with cutoff window)
 *   - requestBookingCancellation → coach (own coaching booking)
 *   - decideBookingCancellation  → admin
 *
 * On success, every action revalidates the calendar route group + the actor's
 * portal so the calendar refetches. We also call `email.send(...)` and
 * `payments.startCheckout(...)` stubs so wiring is in place for the real
 * integrations later.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import {
  notify,
  getAdminRecipients,
  getBookingStakeholders,
  primaryEmailOf,
} from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { startCourtBookingCheckout } from "@/lib/payments";
import {
  checkBookingRules,
  canCancelImmediately,
  type Booker,
  violationsToMessage,
  recurringBlockHits,
} from "./rules";
import { amsterdamMidnightUtc, parseLocalDate, formatLocalDate } from "./time";
import {
  enumerateOccurrences,
  findRecurringSlotConflicts,
  findSingleSlotConflict,
  type RecurringConflictDate,
} from "./recurring";
import { personIsCovered } from "@/lib/memberships/coverage";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

/**
 * Internal sentinel thrown from inside `prisma.$transaction` when the
 * Serializable re-check finds a class / recurring block conflict that wasn't
 * there at pre-flight. Caught by the outer `catch` and turned into the
 * caller-friendly `{ ok: false, error }` shape.
 */
class BookingRaceConflict extends Error {}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CreateBookingSchema = z.object({
  courtId: z.string().uuid(),
  /** ISO 8601 UTC. */
  startsAtUtc: z.string().datetime(),
  needsLights: z.boolean().default(false),
  purpose: z.enum(["personal", "coaching"]).default("personal"),
  /**
   * Coaching-only override: 30 / 45 / 60 minute private lesson slots.
   * Personal bookings ignore this and always use the club's default
   * `bookingDurationMinutes` (usually 60).
   */
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]).optional(),
  notes: z.string().max(500).optional(),
  partners: z
    .array(
      z.object({
        partnerName: z.string().min(1).max(200),
        personId: z.string().uuid().optional(),
      }),
    )
    .max(3)
    .default([]),
  /**
   * Admin-only: book on behalf of a coach (coaching) or member (personal).
   * The booking is attributed to this person, not the logged-in admin.
   */
  bookedForPersonId: z.string().uuid().optional(),
});

export type CreateBookingInput = z.input<typeof CreateBookingSchema>;
export type ActionResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Authn / role resolution
// ---------------------------------------------------------------------------

interface ResolvedActor extends Booker {
  email: string | null;
  fullName: string;
}

async function resolveActor(): Promise<ResolvedActor> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const person = await prisma.person.findUnique({
    where: { id: user.id },
    include: {
      coach: { select: { isActive: true } },
      zzpCoach: { select: { isActive: true } },
      householdMember: { select: { householdId: true } },
    },
  });
  if (!person || person.archivedAt) throw new Error("Account is inactive.");

  const role: Booker["role"] = person.isAdmin
    ? "admin"
    : person.coach?.isActive || person.zzpCoach?.isActive
      ? "coach"
      : "member";

  // Heather feedback v1: a ZZP coach is one whose only active coach
  // hat is the zzpCoach row. People on dual contracts (staff + ZZP)
  // keep the staff-coach horizon — they're already on payroll and the
  // 7-day cap is meant for purely external coaches renting our courts.
  const isZzpCoach =
    role === "coach" &&
    !person.coach?.isActive &&
    !!person.zzpCoach?.isActive;

  return {
    personId: person.id,
    householdId: person.householdMember?.householdId ?? null,
    role,
    isZzpCoach,
    email: user.email ?? null,
    fullName: `${person.firstName} ${person.lastName}`.trim(),
  };
}

type EffectiveBookerResult =
  | { ok: true; booker: Booker; actorPersonId: string; bookerEmail: string | null }
  | { ok: false; error: string };

/**
 * Resolves who the booking is for. Front-desk admins must pick someone else;
 * admin+coach users booking from /coach/book may omit `bookedForPersonId` and
 * book for themselves. Coaches and members always book only for themselves.
 */
async function resolveEffectiveBooker(
  actor: ResolvedActor,
  input: { bookedForPersonId?: string; purpose: "personal" | "coaching" },
): Promise<EffectiveBookerResult> {
  if (actor.role === "admin") {
    if (!input.bookedForPersonId) {
      const self = await prisma.person.findUnique({
        where: { id: actor.personId },
        include: {
          coach: { select: { isActive: true } },
          zzpCoach: { select: { isActive: true } },
        },
      });
      const isActiveCoach =
        !!self?.coach?.isActive || !!self?.zzpCoach?.isActive;
      if (isActiveCoach) {
        const isZzpCoach =
          !self!.coach?.isActive && !!self!.zzpCoach?.isActive;
        return {
          ok: true,
          actorPersonId: actor.personId,
          bookerEmail: actor.email,
          booker: {
            personId: actor.personId,
            householdId: actor.householdId,
            role: "coach",
            isZzpCoach,
          },
        };
      }
      return { ok: false, error: "Choose who this booking is for." };
    }

    const target = await prisma.person.findUnique({
      where: { id: input.bookedForPersonId },
      include: {
        coach: { select: { isActive: true } },
        zzpCoach: { select: { isActive: true } },
        householdMember: { select: { householdId: true } },
        emails: {
          where: { archivedAt: null, isPrimary: true },
          select: { address: true },
          take: 1,
        },
      },
    });
    if (!target || target.archivedAt) {
      return { ok: false, error: "That person wasn't found." };
    }
    const bookerEmail = target.emails[0]?.address ?? null;

    if (input.purpose === "coaching") {
      if (!target.coach?.isActive && !target.zzpCoach?.isActive) {
        return {
          ok: false,
          error: "Pick an active coach for a private lesson booking.",
        };
      }
      const isZzpCoach =
        !target.coach?.isActive && !!target.zzpCoach?.isActive;
      return {
        ok: true,
        actorPersonId: actor.personId,
        bookerEmail,
        booker: {
          personId: target.id,
          householdId: target.householdMember?.householdId ?? null,
          role: "coach",
          isZzpCoach,
        },
      };
    }

    if (!target.householdMember?.householdId) {
      return {
        ok: false,
        error:
          "That person isn't linked to a household — they can't book courts yet.",
      };
    }
    return {
      ok: true,
      actorPersonId: actor.personId,
      bookerEmail,
      booker: {
        personId: target.id,
        householdId: target.householdMember.householdId,
        role: "member",
      },
    };
  }

  if (input.bookedForPersonId) {
    return { ok: false, error: "You can only book for yourself." };
  }

  return {
    ok: true,
    actorPersonId: actor.personId,
    bookerEmail: actor.email,
    booker: {
      personId: actor.personId,
      householdId: actor.householdId,
      role: actor.role,
      isZzpCoach: actor.isZzpCoach,
    },
  };
}

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

export async function createBooking(
  rawInput: CreateBookingInput,
): Promise<ActionResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = CreateBookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  // Members never get to set purpose=coaching. Coaches pick for themselves;
  // admins pick when booking on behalf (coach lesson vs member play).
  const purpose =
    actor.role === "coach" || actor.role === "admin"
      ? input.purpose
      : "personal";

  const effective = await resolveEffectiveBooker(actor, {
    bookedForPersonId: input.bookedForPersonId,
    purpose,
  });
  if (!effective.ok) return { ok: false, error: effective.error };
  const { booker, actorPersonId, bookerEmail } = effective;

  const terms = await getTerms();

  // Teaching-purpose bookings cap at 2 invitees: larger groups compete with
  // structured group offerings, so it's blocked at the API level too.
  if (purpose === "coaching" && input.partners.length > 2) {
    return {
      ok: false,
      error: `${terms.privateLesson.singular} bookings can include at most two additional ${terms.student.plural.toLowerCase()}.`,
    };
  }

  // Coaches (including admin on behalf of a coach) bypass membership checks.
  // Admin on-behalf member bookings use the member's coverage and quotas.
  const bypassMemberRules = booker.role === "coach";

  if (!bypassMemberRules && !booker.householdId) {
    return {
      ok: false,
      error: "Your account isn't linked to a household yet — ask an admin.",
    };
  }

  const startsAt = new Date(input.startsAtUtc);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Invalid start time." };
  }

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    include: {
      club: { include: { bookingSettings: true } },
    },
  });
  if (!court || !court.club.bookingSettings) {
    return { ok: false, error: "Court not found." };
  }
  const settings = court.club.bookingSettings;
  // Coaching bookings (coach or admin) may override the club default to
  // 30 / 45 / 60 minutes. Personal bookings stick to the club setting.
  const effectiveDurationMinutes =
    purpose === "coaching" && input.durationMinutes
      ? input.durationMinutes
      : settings.bookingDurationMinutes;
  const endsAt = new Date(
    startsAt.getTime() + effectiveDurationMinutes * 60_000,
  );

  // ---- Pre-flight rule check (everything except DB-level overlap) ---------
  const localDate = formatLocalDate(startsAt);
  const day = parseLocalDate(localDate);
  const dayStartUtc = amsterdamMidnightUtc(day.year, day.month, day.day);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60_000);

  // Per-person coverage check (single source of truth lives in
  // `lib/memberships/coverage.ts`). The booker themselves must be
  // covered at this club — a parent on a household family membership
  // counts (they're covered by the family row); a spouse covered by
  // a single-club individual row assigned to someone else does not.
  // Coaches and admins bypass member rules entirely (see `bypassMemberRules`).
  const courtClubSlugRaw = court.club.slug.toLowerCase();
  const courtClubSlug =
    courtClubSlugRaw === "triaz" || courtClubSlugRaw === "randwijck"
      ? courtClubSlugRaw
      : null;

  if (
    settings.partnerCaptureMode === "fk_member" &&
    purpose === "personal" &&
    booker.role === "member"
  ) {
    for (const p of input.partners) {
      if (!p.personId) {
        return {
          ok: false,
          error: "Each partner must be selected from the member list.",
        };
      }
      if (p.personId === booker.personId) {
        return {
          ok: false,
          error:
            "You can't list yourself as a partner — you're already the booker.",
        };
      }
    }
    if (courtClubSlug && input.partners.length > 0) {
      for (const p of input.partners) {
        const partnerId = p.personId!;
        const partnerPerson = await prisma.person.findUnique({
          where: { id: partnerId },
          select: {
            archivedAt: true,
            householdMember: { select: { householdId: true } },
          },
        });
        if (
          !partnerPerson ||
          partnerPerson.archivedAt ||
          !partnerPerson.householdMember?.householdId
        ) {
          return {
            ok: false,
            error: "Each partner must be selected from the member list.",
          };
        }
        const partnerCovered = await personIsCovered({
          householdId: partnerPerson.householdMember.householdId,
          personId: partnerId,
          clubSlug: courtClubSlug,
          asOf: startsAt,
        });
        if (!partnerCovered) {
          return {
            ok: false,
            error: "Each partner must be an active member at this club.",
          };
        }
      }
    }
  }

  const [
    activeMembershipsCount,
    bookerBookingsTodayCount,
    conflictingClassSessions,
    candidateBlocks,
  ] = await Promise.all([
    booker.householdId && courtClubSlug
      ? personIsCovered({
          householdId: booker.householdId,
          personId: booker.personId,
          clubSlug: courtClubSlug,
          asOf: startsAt,
        }).then((covered) => (covered ? 1 : 0))
      : Promise.resolve(0),
    prisma.courtBooking.count({
      where: {
        bookedByPersonId: booker.personId,
        clubId: court.clubId,
        status: { in: ["confirmed", "cancellation_requested"] },
        startsAt: { gte: dayStartUtc, lt: dayEndUtc },
      },
    }),
    prisma.classSession.findMany({
      where: {
        courtId: input.courtId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    }),
    prisma.recurringBlock.findMany({
      where: {
        courtId: input.courtId,
        status: "active",
        startsOn: { lte: startsAt },
        endsOn: { gte: startsAt },
      },
    }),
  ]);

  const conflictingRecurringBlocks = candidateBlocks.filter((b) =>
    recurringBlockHits(
      { startsAt, endsAt, courtId: input.courtId },
      b,
      booker.role,
    ),
  );

  const ruleResult = checkBookingRules({
    booker,
    purpose,
    slot: { court, startsAt, endsAt },
    settings,
    activeMembershipsCount,
    bookerBookingsTodayCount,
    conflictingClassSessions,
    conflictingRecurringBlocks,
    partnerCount: input.partners.length,
    now: new Date(),
    terms,
  });

  if (!ruleResult.ok) {
    return { ok: false, error: violationsToMessage(ruleResult.violations) };
  }

  // ---- Pricing: only Randwijck charges (settings.requiresPayment) --------
  const requiresPayment =
    !!settings.requiresPayment &&
    booker.role === "member" &&
    purpose !== "coaching";
  const pricePerHour = settings.defaultPricePerHour
    ? new Prisma.Decimal(settings.defaultPricePerHour.toString())
    : null;
  const priceCharged =
    requiresPayment && pricePerHour
      ? pricePerHour.mul(effectiveDurationMinutes).div(60)
      : null;

  // ---- Insert with EXCLUDE-violation handling ----------------------------
  //
  // The pre-flight rule check above ran outside any transaction, so a class
  // session or admin block created in the gap could have slipped past it.
  // Re-run the class + recurring-block overlap query inside a Serializable
  // transaction immediately before the insert so we catch those races. The
  // `CourtBooking ↔ CourtBooking` race is still handled by the Postgres
  // EXCLUDE constraint (`court_bookings_no_overlap`).
  let bookingId: string;
  try {
    bookingId = await prisma.$transaction(
      async (tx) => {
        const conflictMessage = await findSingleSlotConflict(
          tx,
          {
            courtId: court.id,
            startsAt,
            endsAt,
          },
          booker.role,
        );
        if (conflictMessage) {
          throw new BookingRaceConflict(conflictMessage);
        }
        const created = await tx.courtBooking.create({
          data: {
            courtId: court.id,
            clubId: court.clubId,
            startsAt,
            endsAt,
            bookedByPersonId: booker.personId,
            bookedByHouseholdId: booker.householdId ?? null,
            needsLights: input.needsLights,
            purpose,
            priceCharged,
            paymentStatus: requiresPayment ? "pending" : "not_required",
            status: "confirmed",
            notes: input.notes,
            partners: {
              create: input.partners.map((p, idx) => ({
                partnerName: p.partnerName,
                personId: p.personId,
                displayOrder: idx,
              })),
            },
          },
          select: { id: true },
        });
        await recordAudit({
          tx,
          tableName: "court_bookings",
          rowId: created.id,
          action: "insert",
          changedByPersonId: actorPersonId,
          after: {
            courtId: court.id,
            clubId: court.clubId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            purpose,
            status: "confirmed",
            needsLights: input.needsLights,
            priceCharged: priceCharged ? priceCharged.toString() : null,
            partners: input.partners.map((p) => ({
              partnerName: p.partnerName,
              personId: p.personId,
            })),
          },
          changeSource:
            actor.role === "admin" ? "admin_console" : "web_app",
        });
        return created.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof BookingRaceConflict) {
      return { ok: false, error: e.message };
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      // P2010 = raw query failed. EXCLUDE violation also surfaces with code 23P01
      // wrapped as a generic error from the postgres driver.
      String(e.message).includes("court_bookings_no_overlap")
    ) {
      return {
        ok: false,
        error: "That slot was just taken by someone else — try another one.",
      };
    }
    if (
      typeof (e as { code?: string }).code === "string" &&
      ((e as { code?: string }).code === "23P01" ||
        String((e as Error).message).includes("23P01"))
    ) {
      return {
        ok: false,
        error: "That slot was just taken by someone else — try another one.",
      };
    }
    // Postgres serialization failure (40001) — somebody else committed a
    // conflicting class/block change between our check and our write. Bubble
    // a clean message rather than the raw driver error.
    if (
      typeof (e as { code?: string }).code === "string" &&
      ((e as { code?: string }).code === "40001" ||
        String((e as Error).message).includes("40001"))
    ) {
      return {
        ok: false,
        error:
          "That slot was just changed — please refresh the calendar and try again.",
      };
    }
    throw e;
  }

  // ---- Side effects: payment + confirmation email (stubs) ----------------
  if (requiresPayment && priceCharged) {
    await startCourtBookingCheckout({
      bookingId,
      amountEur: priceCharged.toNumber(),
      payerEmail: bookerEmail,
      payerPersonId: booker.personId,
    });
  }
  if (bookerEmail) {
    await sendEmail({
      to: bookerEmail,
      subject: `Court booked: ${court.name} at ${court.club.name}`,
      body: `Your booking on ${formatLocalDate(startsAt)} for ${effectiveDurationMinutes} min is confirmed.`,
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/coach");
  revalidatePath("/coach/book");
  revalidatePath("/coach/bookings");
  revalidatePath("/portal");
  revalidatePath("/portal/book");
  revalidatePath("/portal/bookings");

  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// Recurring coach block — request workflow
// ---------------------------------------------------------------------------
//
// Non-admin coaches submit a recurring private-lesson series as a `pending`
// request that an admin must approve before it actually blocks the calendar.
// This stops a coach from quietly landing a 12-week series on top of a class
// the office is planning to add next month.
//
// Admins (creating a recurring block on behalf of an external rental, etc.)
// still get an immediate `active` row — they're the ones who'd be approving
// it anyway.

const RecurringCoachBlockSchema = z.object({
  courtId: z.string().uuid(),
  clubId: z.string().uuid(),
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
  /** Local Amsterdam start time, "HH:MM". */
  startTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  /** Inclusive date range for the series, "YYYY-MM-DD". */
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(3).max(80),
  /**
   * YYYY-MM-DD strings the coach has agreed to skip — typically the dates the
   * preview surfaced as clashes when they chose "submit anyway, skip clashes".
   */
  excludedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
});

export type CreateRecurringCoachBlockInput = z.input<
  typeof RecurringCoachBlockSchema
>;
export type RecurringBlockResult =
  | { ok: true; recurringBlockId: string; status: "pending" | "active" }
  | { ok: false; error: string; conflicts?: RecurringConflictDate[] };

interface NormalisedRecurringInput {
  courtId: string;
  clubId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTimeLocal: string;
  durationMinutes: 30 | 45 | 60;
  startsOn: string;
  endsOn: string;
  description: string;
  excludedDates: string[];
  startsOnUtc: Date;
  endsOnUtc: Date;
  startTime: Date;
  endTime: Date;
}

function normaliseRecurringInput(
  raw: CreateRecurringCoachBlockInput,
):
  | { ok: true; data: NormalisedRecurringInput }
  | { ok: false; error: string } {
  const parsed = RecurringCoachBlockSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const startsOn = parseLocalDate(input.startsOn);
  const endsOn = parseLocalDate(input.endsOn);
  const startsOnUtc = amsterdamMidnightUtc(
    startsOn.year,
    startsOn.month,
    startsOn.day,
  );
  const endsOnUtc = amsterdamMidnightUtc(endsOn.year, endsOn.month, endsOn.day);
  if (endsOnUtc < startsOnUtc) {
    return { ok: false, error: "End date must be on or after start date." };
  }

  const [hh, mm] = input.startTimeLocal.split(":").map(Number);
  if (
    Number.isNaN(hh) || Number.isNaN(mm) ||
    hh < 0 || hh > 23 || mm < 0 || mm > 59
  ) {
    return { ok: false, error: "Invalid start time." };
  }
  const endMinutesAbs = hh * 60 + mm + input.durationMinutes;
  if (endMinutesAbs > 24 * 60) {
    return { ok: false, error: "Block cannot spill past midnight." };
  }
  const endHh = Math.floor(endMinutesAbs / 60);
  const endMm = endMinutesAbs % 60;
  // Prisma maps @db.Time(6) off the UTC hour/minute of a Date, so we wrap
  // the local HH:MM as if it were UTC — the date portion is ignored.
  const startTime = new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
  const endTime = new Date(Date.UTC(1970, 0, 1, endHh, endMm, 0));

  return {
    ok: true,
    data: {
      ...input,
      startsOnUtc,
      endsOnUtc,
      startTime,
      endTime,
    },
  };
}

/**
 * Read-only conflict scan exposed as a server action so the coach dialog can
 * preview clashes before submitting. Returns one entry per occurrence date
 * that already has a booking, class session, or other recurring block on the
 * same court+time.
 */
export async function previewRecurringBlockConflicts(
  rawInput: CreateRecurringCoachBlockInput,
): Promise<
  | { ok: true; clashes: RecurringConflictDate[]; occurrenceCount: number }
  | { ok: false; error: string }
> {
  try {
    await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const norm = normaliseRecurringInput(rawInput);
  if (!norm.ok) return norm;
  const data = norm.data;

  const terms = await getTerms();

  const occurrences = enumerateOccurrences({
    dayOfWeek: data.dayOfWeek,
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    excludedDates: data.excludedDates,
  });
  const clashes = await findRecurringSlotConflicts({
    courtId: data.courtId,
    dayOfWeek: data.dayOfWeek,
    startTimeLocal: data.startTimeLocal,
    durationMinutes: data.durationMinutes,
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    excludedDates: data.excludedDates,
    ignoreMembersOnlyBlocks: true,
    terms,
  });
  return { ok: true, clashes, occurrenceCount: occurrences.length };
}

/**
 * Create a coach-owned recurring private-lesson block. Coaches always submit
 * as `status: "pending"` and the admin must approve via
 * `decideRecurringBlockRequest`. Admins creating a block themselves get
 * `status: "active"` immediately.
 *
 * Defense in depth: even though the coach dialog runs `preview` before
 * submitting and includes any clash dates in `excludedDates`, we re-run the
 * scan server-side here. If any non-excluded occurrence still clashes we
 * refuse with the conflict list so the UI can surface it.
 *
 * Pricing is recomputed at invoicing time from the hourly rate; the quoted
 * price stored here is informational only.
 */
export async function createRecurringCoachBlock(
  rawInput: CreateRecurringCoachBlockInput,
): Promise<RecurringBlockResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const terms = await getTerms();
  if (actor.role !== "coach" && actor.role !== "admin") {
    return {
      ok: false,
      error: `Only ${terms.coach.plural} or admins can create recurring ${terms.privateLesson.plural.toLowerCase()}.`,
    };
  }

  const norm = normaliseRecurringInput(rawInput);
  if (!norm.ok) return norm;
  const input = norm.data;

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    select: { id: true, clubId: true, isActive: true, isBookable: true },
  });
  if (!court) return { ok: false, error: "Court not found." };
  if (court.clubId !== input.clubId) {
    return { ok: false, error: "Court does not belong to that club." };
  }
  if (!court.isActive || !court.isBookable) {
    return { ok: false, error: "Court is not bookable." };
  }

  const occurrences = enumerateOccurrences({
    dayOfWeek: input.dayOfWeek,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    excludedDates: input.excludedDates,
  });
  if (occurrences.length === 0) {
    return {
      ok: false,
      error: "No occurrences in this date range — pick a wider range.",
    };
  }

  // Server-side defense in depth: we still run the scan even if the dialog
  // already did. Any non-excluded clash here means we refuse and let the UI
  // re-prompt the coach.
  const clashes = await findRecurringSlotConflicts({
    courtId: input.courtId,
    dayOfWeek: input.dayOfWeek,
    startTimeLocal: input.startTimeLocal,
    durationMinutes: input.durationMinutes,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    excludedDates: input.excludedDates,
    ignoreMembersOnlyBlocks: true,
    terms,
  });
  if (clashes.length > 0) {
    return {
      ok: false,
      error: `${clashes.length} date(s) in this series clash with existing bookings or classes.`,
      conflicts: clashes,
    };
  }

  // Informational quote: flat hourly rate * duration * estimated occurrences.
  const { priceForDurationMinutes, resolveCoachCourtRate } = await import(
    "@/lib/invoicing/private-lesson-rates"
  );
  const { ratePerHour } = await resolveCoachCourtRate(actor.personId);
  const priceQuoted = new Prisma.Decimal(
    (
      priceForDurationMinutes(input.durationMinutes, ratePerHour) *
      occurrences.length
    ).toFixed(2),
  );

  const isAdmin = actor.role === "admin";
  const initialStatus = isAdmin ? "active" : "pending";
  const now = new Date();
  const excludedAsDates = input.excludedDates.map(
    (iso) => new Date(`${iso}T00:00:00.000Z`),
  );

  const created = await prisma.recurringBlock.create({
    data: {
      courtId: court.id,
      clubId: court.clubId,
      requesterPersonId: actor.personId,
      requesterHouseholdId: actor.householdId ?? null,
      purposeType: "coach_private_lesson",
      purposeDescription: input.description,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      startsOn: input.startsOnUtc,
      endsOn: input.endsOnUtc,
      excludedDates: excludedAsDates,
      status: initialStatus,
      activatedAt: isAdmin ? now : null,
      decidedByPersonId: isAdmin ? actor.personId : null,
      decidedAt: isAdmin ? now : null,
      priceQuoted,
      invoiceStatus: "pending",
    },
    select: { id: true },
  });

  if (!isAdmin) {
    const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
    const lessonNoun = terms.privateLesson.singular.toLowerCase();
    if (brand.officeEmail) {
      await sendEmail({
        to: brand.officeEmail,
        subject: `Recurring ${lessonNoun} request from ${actor.fullName}`,
        body: `${actor.fullName} requested a recurring ${lessonNoun} series. Review at /admin/blocks/requests.`,
      });
    }
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/admin/blocks/requests");
  revalidatePath("/admin/private-lessons");
  revalidatePath("/coach");
  revalidatePath("/coach/book");
  revalidatePath("/coach/bookings");

  return {
    ok: true,
    recurringBlockId: created.id,
    status: initialStatus,
  };
}

// ---------------------------------------------------------------------------
// decideRecurringBlockRequest — admin approves / denies a pending request
// ---------------------------------------------------------------------------

const DecideRecurringSchema = z.object({
  blockId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
  /** Required on deny; optional explanatory note on approve. */
  adminNote: z.string().max(1000).optional(),
  /**
   * On approve only: extra YYYY-MM-DD dates to push into `excludedDates`
   * before activating. Used when the admin's live re-check surfaced a clash
   * the original request didn't account for and the admin chose "skip these
   * and approve" instead of denying outright.
   */
  extraExcludedDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .default([]),
});

export type DecideRecurringInput = z.input<typeof DecideRecurringSchema>;
export type DecideRecurringResult =
  | { ok: true; blockId: string; status: "active" | "denied" }
  | { ok: false; error: string; conflicts?: RecurringConflictDate[] };

export async function decideRecurringBlockRequest(
  rawInput: DecideRecurringInput,
): Promise<DecideRecurringResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (actor.role !== "admin") {
    return { ok: false, error: "Admin only." };
  }

  const parsed = DecideRecurringSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { blockId, decision, adminNote, extraExcludedDates } = parsed.data;
  const terms = await getTerms();

  if (decision === "deny" && !(adminNote ?? "").trim()) {
    return {
      ok: false,
      error: `Please leave a short note so the ${terms.coach.singular.toLowerCase()} knows why.`,
    };
  }

  const block = await prisma.recurringBlock.findUnique({
    where: { id: blockId },
    include: {
      requesterPerson: { include: { emails: true } },
    },
  });
  if (!block) return { ok: false, error: "Request not found." };
  if (block.status !== "pending") {
    return {
      ok: false,
      error: "This request is no longer pending — refresh the page.",
    };
  }

  const now = new Date();
  const beforeSnapshot = JSON.parse(JSON.stringify(block));

  if (decision === "deny") {
    await prisma.$transaction(async (tx) => {
      await tx.recurringBlock.update({
        where: { id: blockId },
        data: {
          status: "denied",
          deniedReason: adminNote?.trim() ?? null,
          decidedAt: now,
          decidedByPersonId: actor.personId,
        },
      });
      await tx.auditLog.create({
        data: {
          tableName: "recurring_blocks",
          rowId: blockId,
          action: "update",
          changedByPersonId: actor.personId,
          before: beforeSnapshot,
          after: { status: "denied", deniedReason: adminNote ?? null },
          changeSource: "admin_console",
        },
      });
    });

    const coachEmail = primaryEmailOf(block.requesterPerson);
    await notify({
      recipientPersonId: block.requesterPersonId,
      recipientEmail: coachEmail,
      channels: coachEmail ? ["in_app", "email"] : ["in_app"],
      templateKey: "recurring_block.denied",
      subject: `Your recurring ${terms.privateLesson.singular.toLowerCase()} request was denied`,
      body: `Your recurring series "${block.purposeDescription}" was not approved.\n\nNote from admin: ${adminNote ?? ""}`,
      relatedTable: "recurring_blocks",
      relatedRowId: blockId,
    });

    revalidatePath("/admin/blocks");
    revalidatePath("/admin/blocks/requests");
    revalidatePath("/admin/inbox");
    revalidatePath("/coach/bookings");
    revalidatePath("/coach/inbox");
    return { ok: true, blockId, status: "denied" };
  }

  // ---- Approve flow ----
  // Re-check live conflicts (admin may have added a class since the request
  // came in). Ignore the block being approved itself when scanning so it
  // doesn't see itself as a conflicting `pending` row.
  const startTimeLocal = `${String(block.startTime.getUTCHours()).padStart(2, "0")}:${String(block.startTime.getUTCMinutes()).padStart(2, "0")}`;
  const startsOnIso = isoFromDate(block.startsOn);
  const endsOnIso = isoFromDate(block.endsOn);
  const existingExcluded = block.excludedDates.map(isoFromDate);
  const allExcluded = Array.from(
    new Set([...existingExcluded, ...extraExcludedDates]),
  );

  const durationMinutes =
    (block.endTime.getUTCHours() * 60 + block.endTime.getUTCMinutes()) -
    (block.startTime.getUTCHours() * 60 + block.startTime.getUTCMinutes());

  if (!block.dayOfWeek) {
    return {
      ok: false,
      error: "This block has no day-of-week set; cannot scan for clashes.",
    };
  }

  const recheck = await findRecurringSlotConflicts({
    courtId: block.courtId,
    dayOfWeek: block.dayOfWeek,
    startTimeLocal,
    durationMinutes,
    startsOn: startsOnIso,
    endsOn: endsOnIso,
    excludedDates: allExcluded,
    ignoreRecurringBlockId: block.id,
    ignoreMembersOnlyBlocks: true,
    terms,
  });
  if (recheck.length > 0) {
    return {
      ok: false,
      error:
        "New clashes appeared since this request was submitted. Either deny it or skip the listed dates and try again.",
      conflicts: recheck,
    };
  }

  const updatedExcludedAsDates = allExcluded.map(
    (iso) => new Date(`${iso}T00:00:00.000Z`),
  );

  await prisma.$transaction(async (tx) => {
    await tx.recurringBlock.update({
      where: { id: blockId },
      data: {
        status: "active",
        excludedDates: updatedExcludedAsDates,
        activatedAt: now,
        decidedAt: now,
        decidedByPersonId: actor.personId,
        deniedReason: null,
        internalNotes: adminNote?.trim() ? adminNote.trim() : block.internalNotes,
      },
    });
    await tx.auditLog.create({
      data: {
        tableName: "recurring_blocks",
        rowId: blockId,
        action: "update",
        changedByPersonId: actor.personId,
        before: beforeSnapshot,
        after: {
          status: "active",
          excludedDates: allExcluded,
          activatedAt: now.toISOString(),
        },
        changeSource: "admin_console",
      },
    });
  });

  const coachEmail = primaryEmailOf(block.requesterPerson);
  await notify({
    recipientPersonId: block.requesterPersonId,
    recipientEmail: coachEmail,
    channels: coachEmail ? ["in_app", "email"] : ["in_app"],
    templateKey: "recurring_block.approved",
    subject: "Your recurring lesson request was approved",
    body: `Your recurring series "${block.purposeDescription}" is now active.`,
    relatedTable: "recurring_blocks",
    relatedRowId: blockId,
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/admin/blocks/requests");
  revalidatePath("/admin/inbox");
  revalidatePath("/admin/private-lessons");
  revalidatePath("/coach");
  revalidatePath("/coach/book");
  revalidatePath("/coach/bookings");
  revalidatePath("/coach/inbox");

  return { ok: true, blockId, status: "active" };
}

function isoFromDate(d: Date): string {
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// cancelBooking — immediate cancellation (admin or owner of personal slot)
// ---------------------------------------------------------------------------

const CancelSchema = z.object({
  bookingId: z.string().uuid(),
  /** Optional explanation; saved to cancellation_reason. */
  reason: z.string().max(500).optional(),
});

export async function cancelBooking(
  input: z.input<typeof CancelSchema>,
): Promise<ActionResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { bookingId, reason } = parsed.data;

  const booking = await prisma.courtBooking.findUnique({
    where: { id: bookingId },
    include: { club: { include: { bookingSettings: true } } },
  });
  if (!booking || !booking.club.bookingSettings) {
    return { ok: false, error: "Booking not found." };
  }

  const terms = await getTerms();

  const ruleResult = canCancelImmediately({
    booker: actor,
    booking,
    settings: booking.club.bookingSettings,
    now: new Date(),
    terms,
  });
  if (!ruleResult.ok) {
    return { ok: false, error: violationsToMessage(ruleResult.violations) };
  }

  const cancelNow = new Date();
  const beforeCancelSnapshot = booking;
  await prisma.$transaction(async (tx) => {
    await tx.courtBooking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        cancelledAt: cancelNow,
        cancelledByPersonId: actor.personId,
        cancellationReason: reason,
      },
    });
    await recordAudit({
      tx,
      tableName: "court_bookings",
      rowId: bookingId,
      action: "update",
      changedByPersonId: actor.personId,
      before: beforeCancelSnapshot,
      after: {
        status: "cancelled",
        cancelledAt: cancelNow.toISOString(),
        cancelledByPersonId: actor.personId,
        cancellationReason: reason ?? null,
      },
      changeSource: actor.role === "admin" ? "admin_console" : "web_app",
    });
  });

  if (actor.email) {
    await sendEmail({
      to: actor.email,
      subject: `${terms.court.singular} booking cancelled`,
      body: `Your ${terms.court.singular.toLowerCase()} booking on ${formatLocalDate(booking.startsAt)} has been cancelled.`,
    });
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/coach");
  revalidatePath("/coach/bookings");
  revalidatePath("/portal/bookings");

  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// requestBookingCancellation — coach asks admin to remove a coaching slot
// ---------------------------------------------------------------------------

const RequestCancelSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().min(5).max(1000),
});

export async function requestBookingCancellation(
  input: z.input<typeof RequestCancelSchema>,
): Promise<ActionResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const terms = await getTerms();
  if (actor.role !== "coach") {
    return {
      ok: false,
      error: `Only ${terms.coach.plural} can ask the office to cancel a ${terms.privateLesson.singular.toLowerCase()} ${terms.court.singular.toLowerCase()} booking.`,
    };
  }

  const parsed = RequestCancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Please provide a reason of at least 5 characters for the deletion request.",
    };
  }
  const { bookingId, reason } = parsed.data;

  const booking = await prisma.courtBooking.findUnique({
    where: { id: bookingId },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.bookedByPersonId !== actor.personId) {
    return { ok: false, error: "You can only request your own bookings." };
  }
  if (booking.purpose !== "coaching") {
    return {
      ok: false,
      error: `Personal ${terms.court.singular.toLowerCase()} bookings can be cancelled directly — no admin approval needed.`,
    };
  }
  if (booking.status !== "confirmed") {
    return {
      ok: false,
      error: "This booking isn't in a state that can be requested for cancellation.",
    };
  }

  const beforeSnapshot = booking;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.courtBooking.update({
      where: { id: bookingId },
      data: {
        status: "cancellation_requested",
        cancellationReason: reason,
        cancellationRequestedAt: now,
        cancellationDecisionAt: null,
        cancellationDecidedByPersonId: null,
        cancellationDenialReason: null,
      },
    });
    await recordAudit({
      tx,
      tableName: "court_bookings",
      rowId: bookingId,
      action: "update",
      changedByPersonId: actor.personId,
      before: beforeSnapshot,
      after: {
        status: "cancellation_requested",
        cancellationReason: reason,
        cancellationRequestedAt: now.toISOString(),
      },
    });
  });

  // Notify admins (in-app + email stub) so the deletion queue lights up.
  const admins = await getAdminRecipients();
  const dateLabel = formatLocalDate(booking.startsAt);
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipientPersonId: admin.id,
        recipientEmail: admin.primaryEmail,
        channels: admin.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "booking.cancellation.requested",
        subject: `${terms.coach.singular} deletion request from ${actor.fullName}`,
        body: `${actor.fullName} requested to delete a ${terms.privateLesson.singular.toLowerCase()} ${terms.court.singular.toLowerCase()} booking on ${dateLabel}.\n\nReason: ${reason}`,
        relatedTable: "court_bookings",
        relatedRowId: bookingId,
      }),
    ),
  );

  // Tell members on the booking that their slot is under review — they'd
  // otherwise see a "cancellation_requested" badge with no context.
  const stakeholders = await getBookingStakeholders({
    bookingId,
    excludePersonId: actor.personId,
  });
  await Promise.all(
    stakeholders.map((s) =>
      notify({
        recipientPersonId: s.id,
        recipientEmail: s.primaryEmail,
        channels: s.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey: "booking.cancellation.requested.member",
        subject: `${terms.coach.singular} asked to cancel your slot on ${dateLabel}`,
        body: `Your ${terms.coach.singular.toLowerCase()} (${actor.fullName}) asked the office to cancel your ${terms.court.singular.toLowerCase()} time on ${dateLabel}.\n\nReason: ${reason}\n\nWe'll let you know once it's reviewed.`,
        relatedTable: "court_bookings",
        relatedRowId: bookingId,
      }),
    ),
  );

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/deletions");
  revalidatePath("/admin/inbox");
  revalidatePath("/coach/bookings");
  revalidatePath("/coach/inbox");
  revalidatePath("/portal/bookings");
  revalidatePath("/portal/inbox");

  return { ok: true, bookingId };
}

// ---------------------------------------------------------------------------
// decideBookingCancellation — admin approves or denies a deletion request
// ---------------------------------------------------------------------------

const DecideSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
  /** Required when denying; explains to the coach why their request was refused. */
  denialReason: z.string().max(1000).optional(),
});

export async function decideBookingCancellation(
  input: z.input<typeof DecideSchema>,
): Promise<ActionResult> {
  let actor: ResolvedActor;
  try {
    actor = await resolveActor();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (actor.role !== "admin") {
    return { ok: false, error: "Admin only." };
  }

  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { bookingId, decision, denialReason } = parsed.data;
  const terms = await getTerms();

  if (decision === "deny" && !(denialReason ?? "").trim()) {
    return {
      ok: false,
      error: `Please explain to the ${terms.coach.singular.toLowerCase()} why this deletion request is denied.`,
    };
  }

  const booking = await prisma.courtBooking.findUnique({
    where: { id: bookingId },
    include: { bookedByPerson: { include: { emails: true } } },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status !== "cancellation_requested") {
    return {
      ok: false,
      error: "This booking is not pending an admin decision.",
    };
  }

  const now = new Date();
  const beforeSnapshot = booking;
  const newAfter =
    decision === "approve"
      ? {
          status: "cancelled" as const,
          cancelledAt: now.toISOString(),
          cancelledByPersonId: actor.personId,
          cancellationDecisionAt: now.toISOString(),
          cancellationDecidedByPersonId: actor.personId,
        }
      : {
          status: "confirmed" as const,
          cancellationDecisionAt: now.toISOString(),
          cancellationDecidedByPersonId: actor.personId,
          cancellationDenialReason: denialReason,
        };

  await prisma.$transaction(async (tx) => {
    if (decision === "approve") {
      await tx.courtBooking.update({
        where: { id: bookingId },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledByPersonId: actor.personId,
          cancellationDecisionAt: now,
          cancellationDecidedByPersonId: actor.personId,
        },
      });
    } else {
      await tx.courtBooking.update({
        where: { id: bookingId },
        data: {
          status: "confirmed",
          cancellationDecisionAt: now,
          cancellationDecidedByPersonId: actor.personId,
          cancellationDenialReason: denialReason,
        },
      });
    }
    await recordAudit({
      tx,
      tableName: "court_bookings",
      rowId: bookingId,
      action: "update",
      changedByPersonId: actor.personId,
      before: beforeSnapshot,
      after: newAfter,
      changeSource: "admin_console",
    });
  });

  const dateLabel = formatLocalDate(booking.startsAt);
  const coachEmail = primaryEmailOf(booking.bookedByPerson);

  // Coach hears the decision in their inbox + (later) email.
  await notify({
    recipientPersonId: booking.bookedByPersonId,
    recipientEmail: coachEmail,
    channels: coachEmail ? ["in_app", "email"] : ["in_app"],
    templateKey:
      decision === "approve"
        ? "booking.cancellation.approved"
        : "booking.cancellation.denied",
    subject:
      decision === "approve"
        ? `Your ${terms.privateLesson.singular.toLowerCase()} cancellation was approved`
        : `Your ${terms.privateLesson.singular.toLowerCase()} cancellation was denied`,
    body:
      decision === "approve"
        ? `Your ${terms.privateLesson.singular.toLowerCase()} ${terms.court.singular.toLowerCase()} booking on ${dateLabel} has been removed.`
        : `Your ${terms.privateLesson.singular.toLowerCase()} ${terms.court.singular.toLowerCase()} booking on ${dateLabel} stays on the calendar.\n\nReason: ${denialReason ?? ""}`,
    relatedTable: "court_bookings",
    relatedRowId: bookingId,
  });

  // Affected members hear the outcome too — closes the loop on the
  // "request submitted" notification they got earlier.
  const stakeholders = await getBookingStakeholders({
    bookingId,
    excludePersonId: booking.bookedByPersonId,
  });
  await Promise.all(
    stakeholders.map((s) =>
      notify({
        recipientPersonId: s.id,
        recipientEmail: s.primaryEmail,
        channels: s.primaryEmail ? ["in_app", "email"] : ["in_app"],
        templateKey:
          decision === "approve"
            ? "booking.cancellation.approved.member"
            : "booking.cancellation.denied.member",
        subject:
          decision === "approve"
            ? `Your ${terms.court.singular.toLowerCase()} time on ${dateLabel} was cancelled`
            : `Your ${terms.court.singular.toLowerCase()} time on ${dateLabel} stays on the books`,
        body:
          decision === "approve"
            ? `The office approved the cancellation request for your slot on ${dateLabel}.`
            : `The office kept your slot on ${dateLabel} on the calendar.\n\nReason: ${denialReason ?? ""}`,
        relatedTable: "court_bookings",
        relatedRowId: bookingId,
      }),
    ),
  );

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/bookings/deletions");
  revalidatePath("/admin/inbox");
  revalidatePath("/coach/bookings");
  revalidatePath("/coach/inbox");
  revalidatePath("/portal/bookings");
  revalidatePath("/portal/inbox");

  return { ok: true, bookingId };
}
