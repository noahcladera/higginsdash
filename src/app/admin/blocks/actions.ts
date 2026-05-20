"use server";

/**
 * Admin actions for blocking off court slots.
 *
 * Blocks are persisted as `RecurringBlock` rows; the calendar query in
 * src/lib/booking/queries.ts already excludes booked time and renders these
 * as greyed cells with the description label. We bypass the request /
 * approval workflow that exists for external rentals — admin-created blocks
 * land in `status='active'` immediately.
 *
 * Blocking is a separate concept from coach lessons: coach lessons are
 * regular CourtBooking rows so they count toward coach-hours and live inside
 * the deletion-approval workflow.
 *
 * Both creation actions run a conflict scan against existing court bookings
 * (`confirmed` / `cancellation_requested`) and non-cancelled class sessions.
 * If anything clashes the action refuses with `{ ok: false, conflicts }` so
 * the admin dialog can show what's in the way; passing
 * `acknowledgeConflicts: true` proceeds anyway, stamping the clashing dates
 * into each block's `excludedDates` so the existing rows aren't disrupted.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DayOfWeek, RecurringBlockScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTerms } from "@/lib/tenant";
import {
  amsterdamDayOfWeek,
  amsterdamMidnightUtc,
  parseLocalDate,
} from "@/lib/booking/time";
import {
  findRecurringSlotConflicts,
  type RecurringConflictDate,
} from "@/lib/booking/recurring";

// ---------------------------------------------------------------------------
// createBlock
// ---------------------------------------------------------------------------

const TimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const DateRegex = /^\d{4}-\d{2}-\d{2}$/;

const CreateBlockSchema = z
  .object({
    clubId: z.string().uuid(),
    courtIds: z.array(z.string().uuid()).min(1, "Select at least one court."),
    startDate: z.string().regex(DateRegex),
    endDate: z.string().regex(DateRegex),
    startTime: z.string().regex(TimeRegex),
    endTime: z.string().regex(TimeRegex),
    /** Empty array = block every day in the date range. */
    daysOfWeek: z.array(z.nativeEnum(DayOfWeek)).default([]),
    label: z.string().min(1).max(60),
    notes: z
      .string()
      .max(500)
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    /**
     * If true, the action proceeds even when the scan finds clashes. The
     * conflicting dates are silently added to each block's `excludedDates`
     * so the existing bookings/classes are kept intact.
     */
    acknowledgeConflicts: z.boolean().default(false),
    /**
     * `full` (default) blocks members AND coaches/admins. `members_only`
     * blocks members from booking but lets coaches/admins keep using the
     * court — used for partnerships like Kids Actief that take some courts
     * for members but leave room for private lessons.
     */
    scope: z.nativeEnum(RecurringBlockScope).default(RecurringBlockScope.full),
  })
  .refine((d) => d.startDate <= d.endDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after start time.",
    path: ["endTime"],
  });

export type CreateBlockInput = z.input<typeof CreateBlockSchema>;
export type BlockActionResult =
  | { ok: true; count: number; skippedDateCount?: number }
  | { ok: false; error: string; conflicts?: BlockConflictGroup[] };

/**
 * One group per (courtId, dayOfWeek) tuple — admin block creation can fan
 * out across multiple courts and weekdays from a single dialog submit, and
 * we want to show clashes grouped so the admin understands which slot is
 * affected.
 */
export interface BlockConflictGroup {
  courtId: string;
  courtName: string;
  dayOfWeek: DayOfWeek | null;
  startTimeLocal: string;
  endTimeLocal: string;
  clashes: RecurringConflictDate[];
}

export async function createBlock(
  rawInput: CreateBlockInput,
): Promise<BlockActionResult> {
  const { person } = await requireAdmin();

  const parsed = CreateBlockSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;
  const terms = await getTerms();

  // Confirm every court actually belongs to this club. Prevents a tampered
  // form posting court IDs from another club.
  const courts = await prisma.court.findMany({
    where: { id: { in: input.courtIds }, clubId: input.clubId },
    select: { id: true, name: true },
  });
  if (courts.length !== input.courtIds.length) {
    return { ok: false, error: "One or more courts don't belong to this club." };
  }
  const courtNameById = new Map(courts.map((c) => [c.id, c.name]));

  const startsOn = new Date(`${input.startDate}T00:00:00.000Z`);
  const endsOn = new Date(`${input.endDate}T00:00:00.000Z`);
  const startTime = new Date(`1970-01-01T${input.startTime}:00.000Z`);
  const endTime = new Date(`1970-01-01T${input.endTime}:00.000Z`);
  const durationMinutes =
    timeStringToMinutes(input.endTime) - timeStringToMinutes(input.startTime);

  // Empty daysOfWeek -> single row with dayOfWeek = null (every day in range).
  // The conflict scan only handles concrete DayOfWeek values so when the
  // admin picks "every day", we expand into all 7 weekdays for the scan,
  // then collapse back to a single null-dow row for the actual insert.
  const insertDayKeys: (DayOfWeek | null)[] =
    input.daysOfWeek.length === 0 ? [null] : input.daysOfWeek;
  const scanDayKeys: DayOfWeek[] =
    input.daysOfWeek.length === 0
      ? ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
      : input.daysOfWeek;

  // Conflict scan across every (court, dayOfWeek) tuple.
  const groups: BlockConflictGroup[] = [];
  for (const courtId of input.courtIds) {
    for (const dow of scanDayKeys) {
      const clashes = await findRecurringSlotConflicts({
        courtId,
        dayOfWeek: dow,
        startTimeLocal: input.startTime,
        durationMinutes,
        startsOn: input.startDate,
        endsOn: input.endDate,
        terms,
      });
      if (clashes.length > 0) {
        groups.push({
          courtId,
          courtName: courtNameById.get(courtId) ?? "?",
          dayOfWeek: dow,
          startTimeLocal: input.startTime,
          endTimeLocal: input.endTime,
          clashes,
        });
      }
    }
  }

  if (groups.length > 0 && !input.acknowledgeConflicts) {
    return {
      ok: false,
      error: `${groups.reduce((n, g) => n + g.clashes.length, 0)} occurrence(s) clash with existing bookings or classes.`,
      conflicts: groups,
    };
  }

  // When the admin acknowledges, the clashing dates per (court, dow) get
  // pushed into excludedDates so we never silently overrule a real booking.
  const excludedByCourt = new Map<string, Set<string>>();
  for (const g of groups) {
    const set = excludedByCourt.get(g.courtId) ?? new Set<string>();
    for (const c of g.clashes) set.add(c.date);
    excludedByCourt.set(g.courtId, set);
  }

  const now = new Date();
  const rows = input.courtIds.flatMap((courtId) =>
    insertDayKeys.map((dow) => ({
      courtId,
      clubId: input.clubId,
      requesterPersonId: person.id,
      purposeType: "other" as const,
      purposeDescription: input.label,
      scope: input.scope,
      dayOfWeek: dow,
      startTime,
      endTime,
      startsOn,
      endsOn,
      excludedDates: Array.from(excludedByCourt.get(courtId) ?? []).map(
        (iso) => new Date(`${iso}T00:00:00.000Z`),
      ),
      status: "active" as const,
      requestedAt: now,
      activatedAt: now,
      decidedByPersonId: person.id,
      decidedAt: now,
      internalNotes: input.notes,
    })),
  );

  const result = await prisma.recurringBlock.createMany({ data: rows });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/coach/book");
  revalidatePath("/portal/book");

  const skippedDateCount = Array.from(excludedByCourt.values()).reduce(
    (n, set) => n + set.size,
    0,
  );

  return { ok: true, count: result.count, skippedDateCount };
}

function timeStringToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// createBlocksFromSelection (tap-to-block on admin calendar)
// ---------------------------------------------------------------------------

const PatternSchema = z.object({
  courtId: z.string().uuid(),
  dayOfWeek: z.nativeEnum(DayOfWeek),
  startTime: z.string().regex(TimeRegex),
  endTime: z.string().regex(TimeRegex),
  firstDate: z.string().regex(DateRegex),
});

const CreateBlocksFromSelectionSchema = z
  .object({
    clubId: z.string().uuid(),
    endDate: z.string().regex(DateRegex),
    label: z.string().min(1).max(60),
    notes: z
      .string()
      .max(500)
      .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    excludedDates: z.array(z.string().regex(DateRegex)).default([]),
    patterns: z.array(PatternSchema).min(1, "Select at least one slot."),
    acknowledgeConflicts: z.boolean().default(false),
    scope: z.nativeEnum(RecurringBlockScope).default(RecurringBlockScope.full),
  })
  .refine((d) => d.patterns.every((p) => p.firstDate <= d.endDate), {
    message: "Repeat-until date must be on or after every selected start date.",
    path: ["endDate"],
  })
  .refine((d) => d.patterns.every((p) => p.startTime < p.endTime), {
    message: "Each block must have end time after start time.",
    path: ["patterns"],
  });

const PRISMA_DOW_TO_IDX: Record<DayOfWeek, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

function localDateMatchesPatternDow(
  iso: string,
  patternDow: DayOfWeek,
): boolean {
  const p = parseLocalDate(iso);
  const m = amsterdamMidnightUtc(p.year, p.month, p.day);
  return amsterdamDayOfWeek(m) === PRISMA_DOW_TO_IDX[patternDow];
}

export async function createBlocksFromSelection(
  rawInput: z.input<typeof CreateBlocksFromSelectionSchema>,
): Promise<BlockActionResult> {
  const { person } = await requireAdmin();

  const parsed = CreateBlocksFromSelectionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const input = parsed.data;
  const terms = await getTerms();

  const courtIds = [...new Set(input.patterns.map((p) => p.courtId))];
  const courts = await prisma.court.findMany({
    where: { id: { in: courtIds }, clubId: input.clubId },
    select: { id: true, name: true },
  });
  if (courts.length !== courtIds.length) {
    return { ok: false, error: "One or more courts don't belong to this club." };
  }
  const courtNameById = new Map(courts.map((c) => [c.id, c.name]));

  // Per-pattern conflict scan. Each pattern is a court+dow+time series; we
  // pre-seed `excludedDates` from the admin's own exception list, then look
  // for everything that's still in the way.
  const groups: BlockConflictGroup[] = [];
  const patternExclusions: string[][] = [];
  for (const p of input.patterns) {
    const seedExclusions = input.excludedDates.filter(
      (iso) =>
        iso >= p.firstDate &&
        iso <= input.endDate &&
        localDateMatchesPatternDow(iso, p.dayOfWeek),
    );
    patternExclusions.push(seedExclusions);
    const durationMinutes =
      timeStringToMinutes(p.endTime) - timeStringToMinutes(p.startTime);
    const clashes = await findRecurringSlotConflicts({
      courtId: p.courtId,
      dayOfWeek: p.dayOfWeek,
      startTimeLocal: p.startTime,
      durationMinutes,
      startsOn: p.firstDate,
      endsOn: input.endDate,
      excludedDates: seedExclusions,
      terms,
    });
    if (clashes.length > 0) {
      groups.push({
        courtId: p.courtId,
        courtName: courtNameById.get(p.courtId) ?? "?",
        dayOfWeek: p.dayOfWeek,
        startTimeLocal: p.startTime,
        endTimeLocal: p.endTime,
        clashes,
      });
    }
  }

  if (groups.length > 0 && !input.acknowledgeConflicts) {
    return {
      ok: false,
      error: `${groups.reduce((n, g) => n + g.clashes.length, 0)} occurrence(s) clash with existing bookings or classes.`,
      conflicts: groups,
    };
  }

  // Map (courtId, dayOfWeek, startTime) -> set of clash dates so we can fold
  // each pattern's clashes into its excludedDates without cross-contamination.
  const clashKey = (
    courtId: string,
    dow: DayOfWeek,
    startTime: string,
  ): string => `${courtId}|${dow}|${startTime}`;
  const clashByKey = new Map<string, Set<string>>();
  for (const g of groups) {
    if (!g.dayOfWeek) continue;
    const key = clashKey(g.courtId, g.dayOfWeek, g.startTimeLocal);
    const set = clashByKey.get(key) ?? new Set<string>();
    for (const c of g.clashes) set.add(c.date);
    clashByKey.set(key, set);
  }

  const now = new Date();
  const rows = input.patterns.map((p, i) => {
    const startsOn = new Date(`${p.firstDate}T00:00:00.000Z`);
    const endsOn = new Date(`${input.endDate}T00:00:00.000Z`);
    const startTime = new Date(`1970-01-01T${p.startTime}:00.000Z`);
    const endTime = new Date(`1970-01-01T${p.endTime}:00.000Z`);
    const seed = patternExclusions[i];
    const clashAdds =
      clashByKey.get(clashKey(p.courtId, p.dayOfWeek, p.startTime)) ?? new Set();
    const allExcluded = Array.from(new Set([...seed, ...clashAdds])).map(
      (iso) => new Date(`${iso}T00:00:00.000Z`),
    );
    return {
      courtId: p.courtId,
      clubId: input.clubId,
      requesterPersonId: person.id,
      purposeType: "other" as const,
      purposeDescription: input.label,
      scope: input.scope,
      dayOfWeek: p.dayOfWeek,
      startTime,
      endTime,
      startsOn,
      endsOn,
      excludedDates: allExcluded,
      status: "active" as const,
      requestedAt: now,
      activatedAt: now,
      decidedByPersonId: person.id,
      decidedAt: now,
      internalNotes: input.notes,
    };
  });

  const result = await prisma.recurringBlock.createMany({ data: rows });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/coach/book");
  revalidatePath("/portal/book");

  const skippedDateCount = Array.from(clashByKey.values()).reduce(
    (n, set) => n + set.size,
    0,
  );
  return { ok: true, count: result.count, skippedDateCount };
}

// ---------------------------------------------------------------------------
// cancelBlock
// ---------------------------------------------------------------------------

const CancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function cancelBlock(
  input: z.input<typeof CancelSchema>,
): Promise<BlockActionResult> {
  const { person } = await requireAdmin();
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const block = await prisma.recurringBlock.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!block) return { ok: false, error: "Block not found." };
  if (block.status === "cancelled") {
    return { ok: false, error: "Already cancelled." };
  }

  await prisma.recurringBlock.update({
    where: { id: parsed.data.id },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByPersonId: person.id,
      cancelledReason: parsed.data.reason ?? null,
    },
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/coach/book");
  revalidatePath("/portal/book");

  return { ok: true, count: 1 };
}

// ---------------------------------------------------------------------------
// updateBlockScope (toggle Full <-> Members only on the blocks list)
// ---------------------------------------------------------------------------

const UpdateScopeSchema = z.object({
  id: z.string().uuid(),
  scope: z.nativeEnum(RecurringBlockScope),
});

/**
 * Flip a block's `scope` between `full` and `members_only`. Coach private
 * lessons and Triaz class-capacity holds are always physical reservations of
 * the court and never accept this toggle (the UI doesn't expose it for those
 * purpose types — this is the server-side guard).
 */
export async function updateBlockScope(
  input: z.input<typeof UpdateScopeSchema>,
): Promise<BlockActionResult> {
  await requireAdmin();
  const parsed = UpdateScopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const block = await prisma.recurringBlock.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, purposeType: true, scope: true, status: true },
  });
  if (!block) return { ok: false, error: "Block not found." };
  if (block.purposeType === "coach_private_lesson") {
    return {
      ok: false,
      error: "Lesson blocks always reserve the court fully and can't be changed.",
    };
  }
  if (block.scope === parsed.data.scope) {
    return { ok: true, count: 0 };
  }

  await prisma.recurringBlock.update({
    where: { id: parsed.data.id },
    data: { scope: parsed.data.scope },
  });

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/blocks");
  revalidatePath("/coach/book");
  revalidatePath("/portal/book");

  return { ok: true, count: 1 };
}
