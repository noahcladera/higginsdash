/**
 * Recurring block conflict detection. A `RecurringBlock` claims a court+time
 * slot on every matching weekday between `startsOn` and `endsOn` (skipping
 * `excludedDates`). Before we let a coach submit one — and again before an
 * admin approves it — we enumerate every occurrence and check whether that
 * physical slot is already taken by:
 *
 *   - a `CourtBooking` in `confirmed` or `cancellation_requested`
 *   - a non-cancelled `ClassSession`
 *   - any other `RecurringBlock` in `pending` / `approved` / `active`
 *
 * The same helper feeds the coach's "your series clashes on these dates"
 * dialog and the admin queue's live re-check.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { DayOfWeek, Prisma } from "@prisma/client";
import { DEFAULT_TERMS, decapitalize, type Terms } from "@/lib/tenant/terms";
import {
  amsterdamDayOfWeek,
  amsterdamHourUtc,
  amsterdamMidnightUtc,
  parseLocalDate,
} from "./time";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurringConflictKind = "booking" | "class" | "block";

export interface RecurringConflictDetail {
  kind: RecurringConflictKind;
  /** Human-readable label rendered in the clash UI. */
  label: string;
  /** Optional sub-line: "by Sarah", "Group lesson", etc. */
  byName?: string | null;
}

export interface RecurringConflictDate {
  /** "YYYY-MM-DD" in Europe/Amsterdam local time. */
  date: string;
  conflicts: RecurringConflictDetail[];
}

export interface RecurringSlotInput {
  courtId: string;
  dayOfWeek: DayOfWeek;
  /** "HH:MM" Europe/Amsterdam local time. */
  startTimeLocal: string;
  /** Inclusive minutes — block ends at startTimeLocal + durationMinutes. */
  durationMinutes: number;
  /** Inclusive YYYY-MM-DD range. */
  startsOn: string;
  endsOn: string;
  /** YYYY-MM-DD strings to skip. */
  excludedDates?: string[];
  /**
   * Block ID to exclude from "other recurring block" comparisons (used during
   * the admin re-check on approve, where the block being approved would
   * otherwise clash with itself).
   */
  ignoreRecurringBlockId?: string;
  /**
   * Skip `members_only` blocks when scanning for clashes. Used when the new
   * series being created doesn't actually compete for the court (e.g. a coach
   * private lesson can run on top of a Kids Actief "members only" block).
   */
  ignoreMembersOnlyBlocks?: boolean;
  /** Glossary for human-readable conflict row labels. */
  terms?: Terms;
}

// ---------------------------------------------------------------------------
// Date enumeration
// ---------------------------------------------------------------------------

const DOW_INDEX: Record<DayOfWeek, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** Enumerate every YYYY-MM-DD between startsOn..endsOn matching dayOfWeek. */
export function enumerateOccurrences(input: {
  dayOfWeek: DayOfWeek;
  startsOn: string;
  endsOn: string;
  excludedDates?: string[];
}): string[] {
  const start = parseLocalDate(input.startsOn);
  const end = parseLocalDate(input.endsOn);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  if (endMs < startMs) return [];
  const targetDow = DOW_INDEX[input.dayOfWeek];
  const excluded = new Set(input.excludedDates ?? []);

  const out: string[] = [];
  const ONE_DAY = 24 * 60 * 60_000;
  for (let ms = startMs; ms <= endMs; ms += ONE_DAY) {
    const probe = amsterdamMidnightUtc(
      new Date(ms).getUTCFullYear(),
      new Date(ms).getUTCMonth() + 1,
      new Date(ms).getUTCDate(),
    );
    if (amsterdamDayOfWeek(probe) !== targetDow) continue;
    const iso = isoFromMs(ms);
    if (excluded.has(iso)) continue;
    out.push(iso);
  }
  return out;
}

function isoFromMs(ms: number): string {
  const d = new Date(ms);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// The conflict scan itself
// ---------------------------------------------------------------------------

/**
 * Returns a sparse array containing only dates with at least one conflict.
 * The caller decides whether to surface them as a clash dialog or just stamp
 * them into `excludedDates` and proceed.
 */
export async function findRecurringSlotConflicts(
  input: RecurringSlotInput,
): Promise<RecurringConflictDate[]> {
  const t = input.terms ?? DEFAULT_TERMS;
  const occurrences = enumerateOccurrences({
    dayOfWeek: input.dayOfWeek,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    excludedDates: input.excludedDates,
  });
  if (occurrences.length === 0) return [];

  const [hh, mm] = input.startTimeLocal.split(":").map(Number);
  if (
    Number.isNaN(hh) || Number.isNaN(mm) ||
    hh < 0 || hh > 23 || mm < 0 || mm > 59
  ) {
    return [];
  }

  const startMs = (() => {
    const first = parseLocalDate(occurrences[0]);
    return amsterdamHourUtc(first.year, first.month, first.day, hh, mm).getTime();
  })();
  const lastDay = parseLocalDate(occurrences[occurrences.length - 1]);
  const lastEndMs =
    amsterdamHourUtc(lastDay.year, lastDay.month, lastDay.day, hh, mm).getTime() +
    input.durationMinutes * 60_000;
  const windowStart = new Date(startMs);
  const windowEnd = new Date(lastEndMs);

  // Pull every potentially-relevant row in one go, then filter per-occurrence.
  // The window is bounded so this stays cheap even for year-long series.
  const [bookings, classSessions, otherBlocks] = await Promise.all([
    prisma.courtBooking.findMany({
      where: {
        courtId: input.courtId,
        status: { in: ["confirmed", "cancellation_requested"] },
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        purpose: true,
        bookedByPerson: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.classSession.findMany({
      where: {
        courtId: input.courtId,
        status: { not: "cancelled" },
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        classSeries: { select: { name: true } },
      },
    }),
    prisma.recurringBlock.findMany({
      where: {
        courtId: input.courtId,
        status: { in: ["pending", "approved", "active"] },
        ...(input.ignoreRecurringBlockId
          ? { id: { not: input.ignoreRecurringBlockId } }
          : {}),
        ...(input.ignoreMembersOnlyBlocks ? { scope: "full" as const } : {}),
        startsOn: { lte: new Date(`${input.endsOn}T00:00:00.000Z`) },
        endsOn: { gte: new Date(`${input.startsOn}T00:00:00.000Z`) },
      },
      select: {
        id: true,
        purposeDescription: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        startsOn: true,
        endsOn: true,
        excludedDates: true,
        status: true,
        requesterPerson: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const out: RecurringConflictDate[] = [];

  for (const iso of occurrences) {
    const day = parseLocalDate(iso);
    const slotStart = amsterdamHourUtc(day.year, day.month, day.day, hh, mm);
    const slotEnd = new Date(slotStart.getTime() + input.durationMinutes * 60_000);
    const detail: RecurringConflictDetail[] = [];

    for (const b of bookings) {
      if (b.startsAt < slotEnd && b.endsAt > slotStart) {
        const who = `${b.bookedByPerson.firstName} ${b.bookedByPerson.lastName}`.trim();
        detail.push({
          kind: "booking",
          label:
            b.purpose === "coaching"
              ? `${t.privateLesson.singular} booking`
              : `${t.court.singular} booking`,
          byName: who || null,
        });
      }
    }

    for (const c of classSessions) {
      if (c.startsAt < slotEnd && c.endsAt > slotStart) {
        detail.push({
          kind: "class",
          label: c.classSeries?.name
            ? `${t.class.singular}: ${c.classSeries.name}`
            : t.class.singular,
        });
      }
    }

    for (const rb of otherBlocks) {
      if (recurringBlockOccupiesSlot(rb, slotStart, slotEnd)) {
        const who = `${rb.requesterPerson.firstName} ${rb.requesterPerson.lastName}`.trim();
        detail.push({
          kind: "block",
          label:
            rb.status === "pending"
              ? `Pending request: ${rb.purposeDescription}`
              : `Recurring block: ${rb.purposeDescription}`,
          byName: who || null,
        });
      }
    }

    if (detail.length > 0) out.push({ date: iso, conflicts: detail });
  }

  return out;
}

function recurringBlockOccupiesSlot(
  block: {
    dayOfWeek: DayOfWeek | null;
    startTime: Date;
    endTime: Date;
    startsOn: Date;
    endsOn: Date;
    excludedDates: Date[];
  },
  slotStart: Date,
  slotEnd: Date,
): boolean {
  const day = parseLocalDate(formatIsoLocal(slotStart));
  const slotDateMs = Date.UTC(day.year, day.month - 1, day.day);
  const startsOnMs = Date.UTC(
    block.startsOn.getUTCFullYear(),
    block.startsOn.getUTCMonth(),
    block.startsOn.getUTCDate(),
  );
  const endsOnMs = Date.UTC(
    block.endsOn.getUTCFullYear(),
    block.endsOn.getUTCMonth(),
    block.endsOn.getUTCDate(),
  );
  if (slotDateMs < startsOnMs || slotDateMs > endsOnMs) return false;

  for (const ex of block.excludedDates) {
    const exMs = Date.UTC(
      ex.getUTCFullYear(),
      ex.getUTCMonth(),
      ex.getUTCDate(),
    );
    if (exMs === slotDateMs) return false;
  }

  if (block.dayOfWeek) {
    if (DOW_INDEX[block.dayOfWeek] !== amsterdamDayOfWeek(slotStart)) {
      return false;
    }
  }

  const bStart = block.startTime;
  const bEnd = block.endTime;
  const blockStartUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    bStart.getUTCHours(),
    bStart.getUTCMinutes(),
  );
  const blockEndUtc = amsterdamHourUtc(
    day.year,
    day.month,
    day.day,
    bEnd.getUTCHours(),
    bEnd.getUTCMinutes(),
  );
  return slotStart < blockEndUtc && slotEnd > blockStartUtc;
}

function formatIsoLocal(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

// ---------------------------------------------------------------------------
// One-shot single-slot conflict check (for createBooking inside its txn).
// ---------------------------------------------------------------------------

export interface SingleSlotInput {
  courtId: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Re-runs the class + recurring block overlap query inside the caller's
 * transaction so we close the read-then-write race that exists when
 * `createBooking` runs the rule check and the insert as separate statements.
 *
 * Returns `null` on no conflict; otherwise a short message suitable to bubble
 * back to the caller as a friendly error.
 */
export async function findSingleSlotConflict(
  tx: Prisma.TransactionClient,
  slot: SingleSlotInput,
  /**
   * Skip `members_only` blocks for non-member actors. Defaults to "member"
   * (strictest) when omitted to preserve historical behavior.
   */
  actorRole: "admin" | "coach" | "member" = "member",
): Promise<string | null> {
  const [classSessions, blocks] = await Promise.all([
    tx.classSession.findMany({
      where: {
        courtId: slot.courtId,
        status: { not: "cancelled" },
        startsAt: { lt: slot.endsAt },
        endsAt: { gt: slot.startsAt },
      },
      select: { id: true },
    }),
    tx.recurringBlock.findMany({
      where: {
        courtId: slot.courtId,
        status: "active",
        startsOn: { lte: slot.startsAt },
        endsOn: { gte: slot.startsAt },
        ...(actorRole === "member" ? {} : { scope: "full" as const }),
      },
      select: {
        id: true,
        purposeDescription: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        startsOn: true,
        endsOn: true,
        excludedDates: true,
      },
    }),
  ]);
  if (classSessions.length > 0) return "This slot is reserved for a class.";
  for (const b of blocks) {
    if (
      recurringBlockOccupiesSlot(
        { ...b, dayOfWeek: b.dayOfWeek ?? null },
        slot.startsAt,
        slot.endsAt,
      )
    ) {
      return `This slot is blocked: ${b.purposeDescription}.`;
    }
  }
  return null;
}
