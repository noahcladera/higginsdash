"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import {
  generateSessionsForSeries,
  toDateKey,
} from "@/lib/classes/session-dates";
import {
  CoachAssignmentsJsonSchema,
  GroupsJsonSchema,
  SkillLevelEnum,
  validateCoachAssignments,
  validateGroupCoaches,
  validateGroupsAgainstSeries,
  type CoachAssignmentInput,
  type GroupInput,
} from "@/lib/classes/group-payload";
import { deriveSeriesName } from "@/lib/classes/series-name";
import {
  PricingTiersJsonSchema,
  type PricingTier,
} from "@/lib/classes/pricing-tiers";
import {
  CampOptionsJsonSchema,
  resolveCampCheckoutPrice,
  parseCampOptions,
  syncCampDropInDates,
  type CampOptionsConfig,
} from "@/lib/classes/camp-options";
import type { SkillLevelValue } from "@/lib/skill-levels";
import { getTerms } from "@/lib/tenant";
import { findRecurringSlotConflicts } from "@/lib/booking/recurring";

const DayOfWeek = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const DeliveryMode = z.enum(["at_club", "onsite", "pickup"]);
const ClassType = z.enum([
  "group_lesson",
  "high_performance",
  "school_pickup",
  "school_onsite",
  "private_individual",
  "private_small_group",
  "camp",
  "trial",
  "event",
]);

const TimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Expected HH:MM")
  .transform((v) => {
    const [hh, mm] = v.split(":").map(Number);
    // Prisma's TIME fields come back as Date anchored to 1970-01-01 UTC.
    // Store the same shape going in.
    return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
  });

const OptionalTimeSchema = z
  .union([z.literal(""), TimeSchema])
  .transform((v) => (v === "" ? null : v));

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .transform((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  });

const OptionalUuidSchema = z
  .union([z.literal(""), z.string().uuid()])
  .transform((v) => (v === "" ? null : v));
const OptionalBoolSchema = z
  .union([z.literal("true"), z.literal("false"), z.undefined()])
  .transform((v) => v === "true");

/**
 * Parse a CSV of UUIDs from a hidden form input. Empty string → []. Used
 * for the assistant-coach picker, which stores its selection as
 * comma-separated person ids.
 */
const UuidCsvSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as string[];
    const tokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tok of tokens) {
      if (!/^[0-9a-f-]{36}$/i.test(tok)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid coach id: ${tok}`,
        });
        return z.NEVER;
      }
    }
    if (tokens.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most 5 assistant coaches",
      });
      return z.NEVER;
    }
    return tokens;
  });

/**
 * Parse the hidden `excludedDates` form field: a CSV string of
 * `YYYY-MM-DD` tokens (empty string = no exclusions). Each becomes
 * a UTC-midnight `Date` matching the storage shape of `@db.Date`.
 */
const ExcludedDatesSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as Date[];
    const tokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const out: Date[] = [];
    for (const tok of tokens) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tok)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid excluded date: ${tok}`,
        });
        return z.NEVER;
      }
      const [y, m, d] = tok.split("-").map(Number);
      out.push(new Date(Date.UTC(y, m - 1, d)));
    }
    return out;
  });

const OptionalIntSchema = z
  .union([z.literal(""), z.coerce.number().int().min(0).max(120)])
  .transform((v) => (v === "" ? null : v));

/**
 * EUR amount with up to 2 decimals, blank → null. Used for the
 * per-session catalog price input on the admin class-series form
 * and on the dedicated PricingSectionEditor on the edit page.
 *
 * Why coerce + union with literal "":
 *   - HTML number inputs send "" when the admin clears the field;
 *     we want that to mean "no catalog price" (the portal then
 *     falls back to the "Contact the office for pricing" copy).
 *   - z.coerce.number() turns "35" / "35.50" into a number.
 */
const OptionalEurSchema = z
  .union([z.literal(""), z.coerce.number().min(0).max(10000)])
  .transform((v) => (v === "" ? null : v));

/**
 * Optional WhatsApp group invite link on a ClassSeries. Surfaced to
 * enrolled students and added to the series confirmation email so the
 * parents/players group chat is one click away. We accept any
 * https://chat.whatsapp.com/... URL plus the broader wa.me/... shape
 * for legacy invites; everything else is rejected before reaching the DB.
 */
const WhatsappUrlSchema = z
  .string()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine(
    (v) =>
      v === null ||
      /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(v),
    {
      message:
        "Use a chat.whatsapp.com or wa.me link (e.g. https://chat.whatsapp.com/AbC123).",
    },
  );

/**
 * Schema for the ClassSeries.coverImageUrl field. Accepts any https://
 * URL (Supabase storage URLs, CDN URLs, direct images) up to 2048
 * chars. Empty → NULL so the portal falls back to the program's cover
 * image.
 */
const CoverImageUrlSchema = z
  .string()
  .max(2048)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), {
    message: "Cover image URL must be a full https:// link.",
  });

/** Default per-session catalog price applied when the admin leaves
 *  the price field blank during create. Matches the value we
 *  backfill onto every existing series so the demo Mollie checkout
 *  fires without manual intervention. Keep in sync with
 *  scripts/backfill-class-prices.ts.
 */
const DEFAULT_PRICE_PER_SESSION_EUR = 35;

/**
 * Comma-separated SkillLevel values from a hidden form input. Empty
 * string → []. Used for the series-level eligibility filter and for
 * the per-group filter.
 */
const SkillLevelCsvSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as z.infer<typeof SkillLevelEnum>[];
    const tokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const out: z.infer<typeof SkillLevelEnum>[] = [];
    for (const tok of tokens) {
      const parsed = SkillLevelEnum.safeParse(tok);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid skill level: ${tok}`,
        });
        return z.NEVER;
      }
      out.push(parsed.data);
    }
    return Array.from(new Set(out));
  });

const SeriesSchema = z
  .object({
    programId: OptionalUuidSchema,
    seasonId: OptionalUuidSchema,
    classType: ClassType,
    deliveryMode: DeliveryMode,
    venueId: z.string().uuid(),
    schoolId: OptionalUuidSchema,
    dayOfWeek: DayOfWeek,
    startTime: TimeSchema,
    endTime: TimeSchema,
    pickupAt: OptionalTimeSchema,
    startsOn: DateSchema,
    endsOn: DateSchema,
    excludedDates: ExcludedDatesSchema,
    minAge: OptionalIntSchema,
    maxAge: OptionalIntSchema,
    eligibleSkillLevels: SkillLevelCsvSchema,
    /** When provided, supersedes `leadCoachPersonId`/`assistantCoachPersonIds` */
    coachAssignmentsJson: CoachAssignmentsJsonSchema,
    /** Legacy lead/assistant fields, used when coachAssignmentsJson is empty. */
    leadCoachPersonId: OptionalUuidSchema,
    assistantCoachPersonIds: UuidCsvSchema,
    /** JSON list of sub-groups. Empty → server creates a single default group. */
    groupsJson: GroupsJsonSchema,
    maxStudents: z.coerce.number().int().min(1).max(200),
    minStudents: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(200)])
      .transform((v) => (v === "" ? null : v)),
    internalNotes: z
      .string()
      .max(4000)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    whatsappUrl: WhatsappUrlSchema,
    coverImageUrl: CoverImageUrlSchema,
    /**
     * Per-session catalog price in EUR. Blank on the form → server
     * uses DEFAULT_PRICE_PER_SESSION_EUR so newly created series are
     * immediately checkout-able. The admin can later clear the price
     * via the dedicated PricingSectionEditor to flip the series back
     * into "Contact the office for pricing" mode.
     */
    pricePerSessionEur: OptionalEurSchema,
    /**
     * Manual-name escape hatch. When `useOverride === "true"` the
     * admin typed a custom name that should be stored verbatim,
     * skipping derivation. Empty / "false" → derive from parameters
     * as usual.
     */
    useOverride: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => v === "true"),
    nameOverride: z
      .string()
      .max(160)
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    eventName: z
      .string()
      .max(160)
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    publicNotes: z
      .string()
      .max(4000)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    pricingTiersJson: PricingTiersJsonSchema,
    campOptionsJson: CampOptionsJsonSchema,
    defaultCourtId: OptionalUuidSchema,
    courtBlockStartTime: OptionalTimeSchema,
    courtBlockEndTime: OptionalTimeSchema,
    acknowledgeCourtConflicts: OptionalBoolSchema,
  })
  .refine((s) => s.endsOn >= s.startsOn, {
    message: "endsOn must be after startsOn",
    path: ["endsOn"],
  })
  .refine((s) => s.deliveryMode !== "pickup" || s.pickupAt != null, {
    message: "pickupAt is required for pickup classes",
    path: ["pickupAt"],
  })
  .refine((s) => s.deliveryMode !== "pickup" || s.schoolId != null, {
    message: "schoolId is required for pickup classes",
    path: ["schoolId"],
  })
  .refine(
    (s) =>
      s.classType === "event" ||
      s.deliveryMode === "pickup" ||
      s.programId != null,
    {
      message: "Program is required for non-pickup classes",
      path: ["programId"],
    },
  )
  .refine(
    (s) =>
      s.classType !== "event" ||
      (s.eventName != null && s.eventName.length > 0),
    {
      message: "Event name is required",
      path: ["eventName"],
    },
  )
  .refine(
    (s) =>
      s.classType !== "event" ||
      (s.publicNotes != null && s.publicNotes.length > 0),
    {
      message: "Event description is required",
      path: ["publicNotes"],
    },
  )
  .refine(
    (s) => s.classType !== "event" || s.pricingTiersJson.length > 0,
    {
      message: "At least one price is required",
      path: ["pricingTiersJson"],
    },
  )
  .refine((s) => s.classType !== "camp" || s.campOptionsJson != null, {
    message: "Camp options are required",
    path: ["campOptionsJson"],
  })
  .refine(
    (s) =>
      (s.defaultCourtId == null &&
        s.courtBlockStartTime == null &&
        s.courtBlockEndTime == null) ||
      (s.defaultCourtId != null &&
        s.courtBlockStartTime != null &&
        s.courtBlockEndTime != null),
    {
      message:
        "defaultCourtId, courtBlockStartTime and courtBlockEndTime must be set together",
      path: ["defaultCourtId"],
    },
  )
  .refine(
    (s) =>
      s.courtBlockStartTime == null ||
      s.courtBlockEndTime == null ||
      s.courtBlockStartTime < s.courtBlockEndTime,
    {
      message: "courtBlockEndTime must be after courtBlockStartTime",
      path: ["courtBlockEndTime"],
    },
  )
  .refine(
    (s) => s.excludedDates.every((d) => d >= s.startsOn && d <= s.endsOn),
    {
      message: "Some excluded dates are outside the class date range",
      path: ["excludedDates"],
    },
  )
  .refine(
    (s) => {
      // No duplicates across lead + assistants; lead NEVER appears in
      // the assistants list. Legacy path only — when
      // coachAssignmentsJson is provided we validate that separately.
      if (s.coachAssignmentsJson.length > 0) return true;
      if (!s.leadCoachPersonId) return true;
      return !s.assistantCoachPersonIds.includes(s.leadCoachPersonId);
    },
    {
      message: "The lead coach can't also be listed as an assistant",
      path: ["assistantCoachPersonIds"],
    },
  )
  .refine(
    (s) =>
      s.coachAssignmentsJson.length > 0 ||
      new Set(s.assistantCoachPersonIds).size ===
        s.assistantCoachPersonIds.length,
    {
      message: "Duplicate assistant coaches are not allowed",
      path: ["assistantCoachPersonIds"],
    },
  )
  .refine((s) => s.minAge == null || s.maxAge == null || s.minAge <= s.maxAge, {
    message: "minAge must be ≤ maxAge",
    path: ["minAge"],
  })
  .refine((s) => !s.useOverride || (s.nameOverride && s.nameOverride !== ""), {
    message:
      "Custom name can't be blank — uncheck 'Use custom name' to revert to auto.",
    path: ["nameOverride"],
  });

/**
 * Render a Zod error so the surfaced message includes the offending
 * field path. Without this, the form just gets generic strings like
 * "Too small: expected string to have >=1 characters" with no clue
 * which input the admin actually need to fix.
 */
function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid input";
  const path = first.path.filter((p) => p !== "").join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

/**
 * Cross-validate the chosen venue kind against `deliveryMode` so the
 * form's cascading state can't be bypassed by crafting a rogue request.
 *
 * Rules:
 *   - at_club   → venue.kind must be `club`
 *   - onsite    → venue.kind must NOT be `club`
 *   - pickup    → venue.kind must be `club` (the destination)
 *
 * Also enforces that pickup schools are active.
 */
async function validateLocationInvariants(data: {
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueId: string;
  schoolId: string | null;
}) {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: data.venueId },
    select: { kind: true, clubId: true, isActive: true },
  });
  if (!venue.isActive) {
    throw new Error("Selected venue is archived");
  }
  if (data.deliveryMode === "at_club" && venue.kind !== "club") {
    throw new Error("At-club classes must pick a club venue");
  }
  if (data.deliveryMode === "pickup" && venue.kind !== "club") {
    throw new Error("Pickup classes must ride to a club venue");
  }
  if (data.deliveryMode === "onsite" && venue.kind === "club") {
    throw new Error("On-site classes can't be at a club venue — pick a school or rented court");
  }
  if (data.deliveryMode === "pickup") {
    if (!data.schoolId) {
      throw new Error("Pickup classes require a school");
    }
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: data.schoolId },
      select: { isActive: true },
    });
    if (!school.isActive) {
      throw new Error("Selected school is archived");
    }
  }
  return { venueClubId: venue.clubId };
}

async function validateDefaultCourtForVenue(args: {
  defaultCourtId: string | null;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueClubId: string | null;
}): Promise<string | null> {
  if (!args.defaultCourtId) return null;
  if (args.deliveryMode === "onsite" || !args.venueClubId) {
    throw new Error("A court can only be selected for club venues");
  }
  const row = await prisma.court.findFirst({
    where: {
      id: args.defaultCourtId,
      clubId: args.venueClubId,
      isActive: true,
    },
    select: { id: true },
  });
  if (!row) {
    throw new Error("Selected court is not available at this club");
  }
  return row.id;
}

function minutesBetweenTimes(start: Date, end: Date): number {
  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();
  const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes();
  return endMinutes - startMinutes;
}

function formatConflictDates(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length <= 6) return dates.join(", ");
  return `${dates.slice(0, 6).join(", ")} (+${dates.length - 6} more)`;
}

async function scanCourtConflicts(args: {
  defaultCourtId: string | null;
  dayOfWeek: z.infer<typeof DayOfWeek>;
  blockStartTime: Date | null;
  blockEndTime: Date | null;
  startsOn: Date;
  endsOn: Date;
  excludedDates: Date[];
  acknowledge: boolean;
}) {
  if (
    !args.defaultCourtId ||
    !args.blockStartTime ||
    !args.blockEndTime
  ) {
    return new Set<string>();
  }
  const durationMinutes = minutesBetweenTimes(
    args.blockStartTime,
    args.blockEndTime,
  );
  if (durationMinutes <= 0) {
    throw new Error("Court block end time must be after start time");
  }
  const clashes = await findRecurringSlotConflicts({
    courtId: args.defaultCourtId,
    dayOfWeek: args.dayOfWeek,
    startTimeLocal: dateToHHMM(args.blockStartTime),
    durationMinutes,
    startsOn: toDateKey(args.startsOn),
    endsOn: toDateKey(args.endsOn),
    excludedDates: args.excludedDates.map((d) => toDateKey(d)),
  });
  const conflictDates = clashes.map((c) => c.date);
  if (conflictDates.length > 0 && !args.acknowledge) {
    throw new Error(
      `Court conflicts found on ${formatConflictDates(conflictDates)}. Tick the override checkbox to save and skip only those dates.`,
    );
  }
  return new Set(conflictDates);
}

/**
 * Resolve the lead coach to assign to the series. Empty / missing
 * selection falls back to the canonical "NO COACH YET" placeholder
 * seeded via `seedPlaceholderCoach`.
 */
async function resolveLeadCoachPersonId(
  leadCoachPersonId: string | null,
): Promise<string> {
  const id = leadCoachPersonId ?? SYSTEM_NO_COACH_PERSON_ID;
  const coach = await prisma.coach.findUnique({
    where: { personId: id },
    select: { personId: true, isActive: true, archivedAt: true },
  });
  if (!coach) {
    if (id === SYSTEM_NO_COACH_PERSON_ID) {
      throw new Error(
        "Missing 'NO COACH YET' placeholder coach. Run `prisma db seed` to restore it.",
      );
    }
    throw new Error("Selected coach no longer exists");
  }
  if (coach.archivedAt || !coach.isActive) {
    throw new Error("Selected coach is archived or inactive");
  }
  return coach.personId;
}

/**
 * Validate a list of assistant coach personIds:
 *   - never the NO COACH YET placeholder (that's a lead-only fallback)
 *   - every row must be an active, non-archived coach
 *   - duplicates already filtered out by the Zod layer
 */
async function resolveAssistantCoachPersonIds(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  for (const id of ids) {
    if (id === SYSTEM_NO_COACH_PERSON_ID) {
      throw new Error(
        "The 'NO COACH YET' placeholder can't be picked as an assistant",
      );
    }
  }
  const rows = await prisma.coach.findMany({
    where: { personId: { in: ids } },
    select: { personId: true, isActive: true, archivedAt: true },
  });
  const byId = new Map(rows.map((r) => [r.personId, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error("One of the assistant coaches no longer exists");
    if (row.archivedAt || !row.isActive) {
      throw new Error("One of the assistant coaches is archived or inactive");
    }
  }
  return ids;
}

/**
 * Normalize the legacy `(leadCoachPersonId, assistantCoachPersonIds)`
 * pair into the richer `coachAssignmentsJson` shape so the rest of the
 * code path is uniform. The legacy fallback never carries
 * group-scope or per-coach pickup overrides, so those default to
 * "all groups, participates in pickup".
 */
function normalizeCoachAssignments(args: {
  coachAssignmentsJson: CoachAssignmentInput[];
  leadCoachPersonId: string | null;
  assistantCoachPersonIds: string[];
}): CoachAssignmentInput[] {
  if (args.coachAssignmentsJson.length > 0) {
    return args.coachAssignmentsJson;
  }
  const out: CoachAssignmentInput[] = [];
  if (args.leadCoachPersonId) {
    out.push({
      coachPersonId: args.leadCoachPersonId,
      role: "lead",
      participatesInPickup: true,
      groupTempIds: [],
    });
  }
  for (const id of args.assistantCoachPersonIds) {
    out.push({
      coachPersonId: id,
      role: "assistant",
      participatesInPickup: true,
      groupTempIds: [],
    });
  }
  return out;
}

// Note: `groupTempIds` lives on `CoachAssignmentInput` only for
// backwards compatibility — the schema accepts it but the actions no
// longer read it for any wiring. Per-sub-group coach assignment is
// driven by `GroupInput.coachPersonId` instead.

/**
 * Pick the lead coach personId from a normalized assignments list,
 * defaulting to the synthetic NO COACH YET placeholder when no real
 * lead is assigned. Mirrors the old `resolveLeadCoachPersonId` shape
 * so the existing audit/notify code stays put.
 */
function leadIdFromAssignments(assignments: CoachAssignmentInput[]): string {
  const lead = assignments.find((a) => a.role === "lead");
  return lead?.coachPersonId ?? SYSTEM_NO_COACH_PERSON_ID;
}

/**
 * Validate every non-placeholder coach in the assignments list is a
 * real, active, non-archived coach. Throws on the first problem so
 * the create / update action surfaces a single clear error.
 */
async function validateAssignmentCoaches(
  assignments: CoachAssignmentInput[],
): Promise<void> {
  const ids = assignments
    .map((a) => a.coachPersonId)
    .filter((id) => id !== SYSTEM_NO_COACH_PERSON_ID);
  if (ids.length === 0) return;
  const rows = await prisma.coach.findMany({
    where: { personId: { in: ids } },
    select: { personId: true, isActive: true, archivedAt: true },
  });
  const byId = new Map(rows.map((r) => [r.personId, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new Error("One of the selected coaches no longer exists");
    if (row.archivedAt || !row.isActive) {
      throw new Error("One of the selected coaches is archived or inactive");
    }
  }
  // Assistants can't be the placeholder.
  for (const a of assignments) {
    if (
      a.role === "assistant" &&
      a.coachPersonId === SYSTEM_NO_COACH_PERSON_ID
    ) {
      throw new Error(
        "The 'NO COACH YET' placeholder can't be picked as an assistant",
      );
    }
  }
}

/**
 * Build the canonical group payload. When the form supplies an empty
 * groups list we synthesize a single default group from the
 * series-level fields, mirroring the migration's backfill rule. This
 * keeps the downstream code uniform (every series has ≥1 group, every
 * enrollment has a groupId).
 */
function ensureAtLeastOneGroup(args: {
  groups: GroupInput[];
  fallback: {
    name: string;
    endTimeHHMM: string;
    maxStudents: number;
    minStudents: number | null;
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels: z.infer<typeof SkillLevelEnum>[];
  };
}): GroupInput[] {
  if (args.groups.length > 0) return args.groups;
  return [
    {
      tempId: "__default__",
      name: "Default group",
      displayOrder: 0,
      endTime: args.fallback.endTimeHHMM,
      maxStudents: args.fallback.maxStudents,
      minStudents: args.fallback.minStudents,
      minAge: args.fallback.minAge,
      maxAge: args.fallback.maxAge,
      eligibleSkillLevels: args.fallback.eligibleSkillLevels,
      internalNotes: null,
      coachPersonId: null,
    },
  ];
}

/**
 * Translate a `Date` whose `toUTCHHMM()` is the time-of-day into the
 * "HH:MM" string the group payload uses. Mirrors what the form sends
 * back. Used to derive the synthetic default group's endTime from
 * `series.endTime`.
 */
function toUTCHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToTimeDate(hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

/**
 * Compare two HH:MM strings lexically. Safe because both are
 * zero-padded.
 */
function maxHHMM(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Reject series creates/updates where the linked season's audience
 * doesn't match the program's `targetAudience`. `mixed` programs
 * (privates) accept either youth or adult seasons. Camp / event_window
 * / holiday seasons have no audience and are always allowed (they're
 * the free-form bucket).
 */
async function validateSeasonAudienceMatchesProgram(args: {
  seasonId: string | null | undefined;
  programId: string;
}): Promise<void> {
  if (!args.seasonId) return;
  const [season, program] = await Promise.all([
    prisma.season.findUnique({
      where: { id: args.seasonId },
      select: { audience: true, name: true },
    }),
    prisma.program.findUnique({
      where: { id: args.programId },
      select: { targetAudience: true, name: true },
    }),
  ]);
  if (!season) throw new Error("Selected season no longer exists");
  if (!program) throw new Error("Selected program no longer exists");
  if (program.targetAudience === "mixed") return;
  const programIsYouth = program.targetAudience === "kids";
  const seasonIsYouth = season.audience === "youth";
  if (programIsYouth !== seasonIsYouth) {
    throw new Error(
      `${season.name} is a ${season.audience} season — pick a ${
        seasonIsYouth ? "youth" : "adult"
      } program (or switch to a ${
        programIsYouth ? "youth" : "adult"
      } season).`,
    );
  }
}

/**
 * Resolve the canonical series name from its parameters.
 *
 * Single source of truth for `class_series.name` — the form no longer
 * accepts a name input, every server action that mutates one of the
 * name-driving fields (program, season, location, schedule) re-runs
 * this and writes the result. See {@link deriveSeriesName}.
 */
async function resolveSeriesName(args: {
  programId: string;
  seasonId: string | null | undefined;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueId: string;
  schoolId: string | null | undefined;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTime: Date;
  startsOn: Date | null;
  /**
   * Series-level umbrella age band — passed in directly because at
   * create-time the row doesn't exist yet and at update-time the
   * caller usually has an `override.minAge` they want applied.
   */
  seriesMinAge: number | null;
  seriesMaxAge: number | null;
  /**
   * Series-level eligible skill levels (umbrella). Adults use this
   * for the trailing level suffix; kids/mixed series ignore it.
   */
  seriesEligibleSkillLevels: SkillLevelValue[];
  /**
   * Live sub-groups in display order. Single-group series pass `[]`
   * (or a 1-element list) and the helper falls back to the umbrella
   * band; multi-group series get each band joined with ` & `.
   */
  groups: Array<{
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels: SkillLevelValue[];
  }>;
  /**
   * Optional verbatim override. When non-null/non-empty the helper
   * skips derivation entirely and returns this string. Mirrors the
   * `name_override` column on `class_series`.
   */
  nameOverride?: string | null;
}): Promise<string> {
  // Manual-override gate: a non-empty `nameOverride` is stored
  // verbatim; the helper short-circuits derivation to keep both
  // call paths (create + duplicate) symmetric with `nameForSeries`.
  const overrideValue = (args.nameOverride ?? "").trim();
  if (overrideValue) return overrideValue;

  const [program, venue, school, season] = await Promise.all([
    prisma.program.findUniqueOrThrow({
      where: { id: args.programId },
      select: { targetAudience: true },
    }),
    prisma.venue.findUniqueOrThrow({
      where: { id: args.venueId },
      select: { name: true },
    }),
    args.schoolId
      ? prisma.school.findUniqueOrThrow({
          where: { id: args.schoolId },
          select: { name: true },
        })
      : Promise.resolve(null),
    args.seasonId
      ? prisma.season.findUniqueOrThrow({
          where: { id: args.seasonId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  const startYear = args.startsOn ? args.startsOn.getUTCFullYear() : null;
  return deriveSeriesName({
    audience: program.targetAudience,
    deliveryMode: args.deliveryMode,
    venueName: venue.name,
    schoolName: school?.name ?? null,
    dayOfWeek: args.dayOfWeek,
    startTimeHHMM: dateToHHMM(args.startTime),
    seasonName: season?.name ?? null,
    startYear,
    seriesMinAge: args.seriesMinAge,
    seriesMaxAge: args.seriesMaxAge,
    seriesEligibleSkillLevels: args.seriesEligibleSkillLevels,
    groups: args.groups,
  });
}

/**
 * Resolve the `programId` to use for a series:
 *   - `pickup` mode → canonical `kids-group` program (created in seed).
 *   - everything else → admin's explicit choice.
 */
async function resolveProgramId(args: {
  deliveryMode: "at_club" | "onsite" | "pickup";
  programId: string | null;
  classType?: z.infer<typeof ClassType>;
}): Promise<string> {
  if (args.classType === "event") {
    const canonical = await prisma.program.findUnique({
      where: { slug: "events" },
      select: { id: true, isActive: true },
    });
    if (!canonical || !canonical.isActive) {
      throw new Error(
        "Missing canonical 'events' program. Run `prisma db seed` to restore it.",
      );
    }
    return canonical.id;
  }
  if (args.classType === "camp") {
    const canonical = await prisma.program.findUnique({
      where: { slug: "camps" },
      select: { id: true, isActive: true },
    });
    if (!canonical || !canonical.isActive) {
      throw new Error(
        "Missing canonical 'camps' program. Run `prisma db seed` to restore it.",
      );
    }
    return canonical.id;
  }
  if (args.deliveryMode === "pickup") {
    const canonical = await prisma.program.findUnique({
      where: { slug: "kids-group" },
      select: { id: true, isActive: true },
    });
    if (!canonical || !canonical.isActive) {
      throw new Error(
        "Missing canonical 'kids-group' program. Run `prisma db seed` to restore it.",
      );
    }
    return canonical.id;
  }
  if (!args.programId) {
    throw new Error("Program is required");
  }
  return args.programId;
}

/**
 * Create a new ClassSeries and auto-generate all its ClassSession rows
 * for every occurrence of `dayOfWeek` between `startsOn` and `endsOn`
 * (inclusive), skipping any date in the submitted `excludedDates`.
 * Sessions are created as `scheduled`.
 */
export async function createClassSeries(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = SeriesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;
  const terms = await getTerms();
  const isEvent = data.classType === "event";
  const isCamp = data.classType === "camp";

  // Build the canonical groups list. Empty submission → server-side
  // synthesizes a single default group mirroring the series-level
  // limits/age band so every series has ≥1 group on disk.
  const groups = ensureAtLeastOneGroup({
    groups: data.groupsJson,
    fallback: {
      name: "Default group",
      endTimeHHMM: toUTCHHMM(data.endTime),
      maxStudents: data.maxStudents,
      minStudents: data.minStudents,
      minAge: data.minAge,
      maxAge: data.maxAge,
      eligibleSkillLevels: data.eligibleSkillLevels,
    },
  });

  // Lift the series-level endTime to the latest group end so the
  // ClassSeries window stays the union footprint (used everywhere for
  // scheduling and the calendar span).
  const seriesEndHHMM = groups.reduce(
    (acc, g) => maxHHMM(acc, g.endTime),
    toUTCHHMM(data.endTime),
  );
  const seriesEndTime = hhmmToTimeDate(seriesEndHHMM);

  const groupsValidation = validateGroupsAgainstSeries({
    groups,
    seriesEndTime: seriesEndHHMM,
    seriesMinAge: data.minAge,
    seriesMaxAge: data.maxAge,
  });
  if (groupsValidation) throw new Error(groupsValidation);

  const assignments = normalizeCoachAssignments({
    coachAssignmentsJson: data.coachAssignmentsJson,
    leadCoachPersonId: data.leadCoachPersonId,
    assistantCoachPersonIds: data.assistantCoachPersonIds,
  });
  const assignmentValidation = validateCoachAssignments({
    assignments,
    coachSingular: terms.coach.singular,
  });
  if (assignmentValidation) throw new Error(assignmentValidation);

  // Per-sub-group coach picks must reference real lead/assistant
  // coaches submitted on the same form. The placeholder
  // NO-COACH-YET row never makes it into the assignments list, so
  // a single-group create with no real coach can still go through
  // (lead implicitly covers it). 2+ groups requires every row to
  // have a coach picked.
  const rosterPersonIds = new Set(assignments.map((a) => a.coachPersonId));
  if (!isEvent) {
    const coachValidation = validateGroupCoaches({
      groups,
      rosterCoachPersonIds: rosterPersonIds,
      coachSingular: terms.coach.singular,
      classSingular: terms.class.singular,
      classGroupSingular: terms.classGroup.singular,
    });
    if (coachValidation) throw new Error(coachValidation);
  }

  const [{ venueClubId }, programId] = await Promise.all([
    validateLocationInvariants({
      deliveryMode: data.deliveryMode,
      venueId: data.venueId,
      schoolId: data.schoolId,
    }),
    resolveProgramId({
      deliveryMode: data.deliveryMode,
      programId: data.programId,
      classType: data.classType,
    }),
    validateAssignmentCoaches(assignments),
  ]);

  const defaultCourtId = await validateDefaultCourtForVenue({
    defaultCourtId: data.defaultCourtId,
    deliveryMode: data.deliveryMode,
    venueClubId,
  });
  const courtBlockStartTime = defaultCourtId
    ? (data.courtBlockStartTime ?? data.startTime)
    : null;
  const courtBlockEndTime = defaultCourtId
    ? (data.courtBlockEndTime ?? seriesEndTime)
    : null;

  if (!isEvent) {
    await validateSeasonAudienceMatchesProgram({
      seasonId: data.seasonId,
      programId,
    });
  }

  // When the admin ticked "Use custom name", store it verbatim and
  // skip derivation. Otherwise the helper builds the canonical name
  // from program + season + location + schedule + ages/levels.
  const overrideName = isEvent
    ? data.eventName
    : data.useOverride
      ? data.nameOverride
      : null;
  const derivedName = isEvent
    ? (data.eventName ?? "")
    : await resolveSeriesName({
        programId,
        seasonId: data.seasonId,
        deliveryMode: data.deliveryMode,
        venueId: data.venueId,
        schoolId: data.schoolId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        startsOn: data.startsOn,
        seriesMinAge: data.minAge,
        seriesMaxAge: data.maxAge,
        seriesEligibleSkillLevels: data.eligibleSkillLevels,
        groups: groups
          .slice()
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
          .map((g) => ({
            minAge: g.minAge ?? null,
            maxAge: g.maxAge ?? null,
            eligibleSkillLevels: g.eligibleSkillLevels ?? [],
          })),
        nameOverride: overrideName,
      });

  // The "owning" club mirrors where the class actually plays:
  // at-club / pickup both play at a club venue, so pick up its clubId.
  // On-site lives at a non-club venue — no owning club.
  const clubId =
    data.deliveryMode === "onsite" ? null : (venueClubId ?? null);

  const conflictExcluded = await scanCourtConflicts({
    defaultCourtId,
    dayOfWeek: data.dayOfWeek,
    blockStartTime: courtBlockStartTime,
    blockEndTime: courtBlockEndTime,
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    excludedDates: data.excludedDates,
    acknowledge: data.acknowledgeCourtConflicts,
  });
  const excluded = new Set(data.excludedDates.map((d) => toDateKey(d)));
  for (const key of conflictExcluded) excluded.add(key);
  const sessionStartTime = defaultCourtId
    ? (courtBlockStartTime ?? data.startTime)
    : data.startTime;
  const sessionEndTime = defaultCourtId
    ? (courtBlockEndTime ?? seriesEndTime)
    : seriesEndTime;
  const sessions = generateSessionsForSeries(data.classType, {
    startsOn: data.startsOn,
    endsOn: data.endsOn,
    dayOfWeek: data.dayOfWeek,
    startTime: sessionStartTime,
    endTime: sessionEndTime,
    excluded,
  });

  const leadCoachPersonId = leadIdFromAssignments(assignments);
  // Make sure NO COACH YET exists when we fall back to it.
  if (leadCoachPersonId === SYSTEM_NO_COACH_PERSON_ID) {
    await resolveLeadCoachPersonId(null);
  }

  // Catalog price wiring. Classes: per-session × session count.
  // Events: flat price from pricing tiers (primary tier → pricePerSeries).
  let pricePerSession: number | null;
  let pricePerSeries: number | null;
  let pricingTiers: PricingTier[] | null = null;
  let campOptions: CampOptionsConfig | null = null;

  if (isEvent) {
    const tiers = data.pricingTiersJson;
    pricingTiers = tiers;
    const primary =
      tiers.find((t) => !t.forMembers) ?? tiers[0] ?? null;
    pricePerSeries = primary?.amountEur ?? null;
    pricePerSession =
      pricePerSeries != null && sessions.length > 0
        ? Math.round((pricePerSeries / sessions.length) * 100) / 100
        : pricePerSeries;
  } else if (isCamp) {
    campOptions = data.campOptionsJson;
    if (campOptions) {
      campOptions = syncCampDropInDates(
        campOptions,
        sessions.map((s) => toDateKey(s.startsAt)),
      );
    }
    pricePerSeries = resolveCampCheckoutPrice({
      campOptions,
      selection: campOptions?.options[0]
        ? { optionId: campOptions.options[0].id }
        : null,
      hasActiveMembership: false,
    });
    pricePerSession =
      pricePerSeries != null && sessions.length > 0
        ? Math.round((pricePerSeries / sessions.length) * 100) / 100
        : pricePerSeries;
  } else {
    pricePerSession =
      data.pricePerSessionEur ?? DEFAULT_PRICE_PER_SESSION_EUR;
    pricePerSeries =
      sessions.length > 0 ? pricePerSession * sessions.length : null;
  }

  const created = await prisma.$transaction(async (tx) => {
    // 1. Create the series shell (without nested coaches/groups so we
    //    can reference the generated group ids when wiring coach
    //    scopes).
    const row = await tx.classSeries.create({
      data: {
        program: { connect: { id: programId } },
        season: data.seasonId ? { connect: { id: data.seasonId } } : undefined,
        venue: { connect: { id: data.venueId } },
        school:
          data.deliveryMode === "pickup" && data.schoolId
            ? { connect: { id: data.schoolId } }
            : undefined,
        club: clubId ? { connect: { id: clubId } } : undefined,
        defaultCourt:
          defaultCourtId != null ? { connect: { id: defaultCourtId } } : undefined,
        name: derivedName,
        nameOverride: overrideName,
        classType: data.classType,
        deliveryMode: data.deliveryMode,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: seriesEndTime,
        courtBlockStartTime,
        courtBlockEndTime,
        pickupAt: data.deliveryMode === "pickup" ? data.pickupAt : null,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        excludedDates: Array.from(excluded).map((iso) => {
          const [y, m, d] = iso.split("-").map(Number);
          return new Date(Date.UTC(y, m - 1, d));
        }),
        minAge: data.minAge,
        maxAge: data.maxAge,
        eligibleSkillLevels: data.eligibleSkillLevels,
        maxStudents: data.maxStudents,
        minStudents: data.minStudents,
        internalNotes: data.internalNotes,
        publicNotes: isEvent ? data.publicNotes : undefined,
        whatsappUrl: data.whatsappUrl,
        coverImageUrl: data.coverImageUrl,
        pricePerSession,
        pricePerSeries,
        pricingTiers:
          pricingTiers != null && pricingTiers.length > 0
            ? (pricingTiers as unknown as Prisma.InputJsonValue)
            : undefined,
        campOptions:
          campOptions != null
            ? (campOptions as unknown as Prisma.InputJsonValue)
            : undefined,
        status: "published",
        sessions: {
          create: sessions.map((s) => ({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            courtId: defaultCourtId,
            status: "scheduled",
          })),
        },
      },
    });

    // 2. Create groups; remember tempId → real group id mapping.
    const tempIdToGroupId = new Map<string, string>();
    for (const [idx, g] of groups.entries()) {
      const created = await tx.classSeriesGroup.create({
        data: {
          classSeriesId: row.id,
          name: g.name,
          displayOrder: g.displayOrder ?? idx,
          minAge: g.minAge,
          maxAge: g.maxAge,
          eligibleSkillLevels: g.eligibleSkillLevels,
          endTime: hhmmToTimeDate(g.endTime),
          maxStudents: g.maxStudents,
          minStudents: g.minStudents,
          internalNotes: g.internalNotes,
        },
        select: { id: true },
      });
      tempIdToGroupId.set(g.tempId, created.id);
    }

    // 3. Wire coaches with per-coach pickup state. Per-sub-group
    //    teaching is wired in a separate pass below using the
    //    `GroupInput.coachPersonId` picks (not the legacy chip
    //    multi-select on the Coaches card).
    const seriesCoachIdByPersonId = new Map<string, string>();
    for (const a of assignments) {
      const seriesCoach = await tx.classSeriesCoach.create({
        data: {
          classSeriesId: row.id,
          coachPersonId: a.coachPersonId,
          role: a.role,
          participatesInPickup: a.participatesInPickup,
        },
        select: { id: true },
      });
      seriesCoachIdByPersonId.set(a.coachPersonId, seriesCoach.id);
    }

    // 3b. One coach scope per sub-group that picked a coach. Single-
    //     group create skips this entirely — the lead implicitly
    //     covers the sole sub-group.
    const scopesToCreate: Array<{
      classSeriesCoachId: string;
      groupId: string;
    }> = [];
    for (const g of groups) {
      if (!g.coachPersonId) continue;
      const seriesCoachId = seriesCoachIdByPersonId.get(g.coachPersonId);
      if (!seriesCoachId) {
        throw new Error(
          `Sub-group "${g.name}" is assigned to a coach who isn't on this class' roster.`,
        );
      }
      const realGroupId = tempIdToGroupId.get(g.tempId)!;
      scopesToCreate.push({
        classSeriesCoachId: seriesCoachId,
        groupId: realGroupId,
      });
    }
    if (scopesToCreate.length > 0) {
      await tx.classSeriesCoachGroup.createMany({ data: scopesToCreate });
    }
    // If no human coach was assigned at all, drop in the NO COACH YET
    // placeholder so downstream queries that expect a lead always
    // find one. Mirrors the legacy resolveLeadCoachPersonId fallback.
    if (assignments.length === 0) {
      await tx.classSeriesCoach.create({
        data: {
          classSeriesId: row.id,
          coachPersonId: SYSTEM_NO_COACH_PERSON_ID,
          role: "lead",
          participatesInPickup: true,
        },
      });
    }

    await recordAudit({
      tx,
      tableName: "class_series",
      rowId: row.id,
      action: "insert",
      changedByPersonId: admin.id,
      after: {
        name: row.name,
        classType: row.classType,
        deliveryMode: row.deliveryMode,
        dayOfWeek: row.dayOfWeek,
        startsOn: row.startsOn.toISOString(),
        endsOn: row.endsOn.toISOString(),
        maxStudents: row.maxStudents,
        minStudents: row.minStudents,
        minAge: row.minAge,
        maxAge: row.maxAge,
        status: row.status,
        venueId: row.venueId,
        clubId: row.clubId,
        programId: row.programId,
        sessionsCreated: sessions.length,
        groupsCreated: groups.length,
        pricePerSession,
        pricePerSeries,
        coachAssignments: assignments.map((a) => ({
          coachPersonId: a.coachPersonId,
          role: a.role,
          participatesInPickup: a.participatesInPickup,
        })),
        groupCoachAssignments: groups.map((g) => ({
          tempId: g.tempId,
          coachPersonId: g.coachPersonId,
        })),
      },
      changeSource: "admin_console",
    });
    return row;
  });

  revalidatePath("/admin/classes");
  revalidatePath("/admin/events");
  revalidatePath("/admin/camps");
  revalidatePath("/portal/book");
  revalidatePath("/portal/events");
  redirect(
    isEvent ? `/admin/events/${created.id}` : `/admin/classes/${created.id}`,
  );
}

// ---------------------------------------------------------------------------
// Scoped section-level update actions (used by the locked edit page)
// ---------------------------------------------------------------------------

/**
 * Shared postscript: invalidate every page that surfaces sessions or
 * series data so an in-place admin edit reflects everywhere without a
 * hard reload.
 *
 * Touching any series field can ripple into:
 *   - the admin classes list + detail page
 *   - the parent portal (book + their enrolled-classes view)
 *   - the coach workspace (today, calendar, classes, hours) — every
 *     coach on the series sees their own derived view of these
 *     sessions, so a Tue→Fri change must bust their week-grid cache
 *     too. Without this the coach calendar happily kept rendering the
 *     stale Tuesday block forever.
 */
function revalidateSeries(classSeriesId: string) {
  revalidatePath("/admin/classes");
  revalidatePath("/admin/events");
  revalidatePath("/admin/camps");
  revalidatePath(`/admin/classes/${classSeriesId}`);
  revalidatePath(`/admin/events/${classSeriesId}`);
  revalidatePath("/portal/book");
  revalidatePath("/portal/classes");
  revalidatePath("/portal/events");
  revalidatePath("/coach");
  revalidatePath("/coach/calendar");
  revalidatePath("/coach/classes");
  revalidatePath(`/coach/classes/${classSeriesId}`);
  revalidatePath("/coach/hours");
}

/**
 * Common shape the rename helpers want from the persisted series.
 * Defined inline so we don't need to leak prisma generated types.
 */
type RenameContext = {
  name: string;
  /**
   * Manual-name override. When non-null/non-empty the rename helpers
   * skip derivation entirely and reuse this string verbatim.
   */
  nameOverride?: string | null;
  deliveryMode: "at_club" | "onsite" | "pickup";
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null;
  startTime: Date;
  minAge: number | null;
  maxAge: number | null;
  /**
   * Series-level eligible skill levels. Adults use this for the
   * trailing level suffix; kids/mixed series ignore it.
   */
  eligibleSkillLevels: SkillLevelValue[];
  venue: { name: string } | null;
  school: { name: string } | null;
  program: { targetAudience: "kids" | "adults" | "mixed" };
  /**
   * Live sub-groups (non-archived) in display order. Empty list /
   * single entry → derive from the series-level umbrella band; 2+
   * entries with any age bound or distinct level set → join each
   * band/level set with ` & `.
   */
  groups: Array<{
    minAge: number | null;
    maxAge: number | null;
    eligibleSkillLevels: SkillLevelValue[];
  }>;
};

/**
 * Wrap `deriveSeriesName` with the manual-override gate.
 *
 * Every server-side write of `class_series.name` routes through this
 * helper so the rule is impossible to forget: a non-empty
 * `nameOverride` short-circuits derivation, otherwise the canonical
 * name is computed from the series' parameters.
 */
function nameForSeries(
  override: string | null | undefined,
  derive: () => string,
): string {
  const trimmed = (override ?? "").trim();
  if (trimmed) return trimmed;
  return derive();
}

/**
 * Re-derive a series name from its in-memory context plus any
 * overridden field(s). This is the post-write recompute used by every
 * naming-driving update path (location, schedule, naming step). The
 * server is the only writer of `class_series.name` — the only escape
 * hatch is `existing.nameOverride` / `override.nameOverride`, which
 * causes the override to be returned verbatim instead of recomputing.
 */
function rederiveSeriesName(args: {
  existing: RenameContext & {
    season?: { name: string | null } | null;
    startsOn?: Date | null;
  };
  override?: {
    deliveryMode?: "at_club" | "onsite" | "pickup";
    venueName?: string | null;
    schoolName?: string | null;
    dayOfWeek?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    startTime?: Date;
    seasonName?: string | null;
    startsOn?: Date | null;
    audience?: "kids" | "adults" | "mixed";
    minAge?: number | null;
    maxAge?: number | null;
    eligibleSkillLevels?: SkillLevelValue[];
    groups?: Array<{
      minAge: number | null;
      maxAge: number | null;
      eligibleSkillLevels: SkillLevelValue[];
    }>;
    /**
     * Explicit override of the manual name escape hatch. `undefined`
     * leaves the existing override in place; `null` clears it; a
     * string replaces it. Mirrors how the other override fields work.
     */
    nameOverride?: string | null;
  };
}): string {
  const { existing, override = {} } = args;
  const overrideValue =
    override.nameOverride !== undefined
      ? override.nameOverride
      : existing.nameOverride;
  return nameForSeries(overrideValue, () => {
    const startsOn = override.startsOn ?? existing.startsOn ?? null;
    return deriveSeriesName({
      audience: override.audience ?? existing.program.targetAudience,
      deliveryMode: override.deliveryMode ?? existing.deliveryMode,
      venueName: override.venueName ?? existing.venue?.name ?? null,
      schoolName: override.schoolName ?? existing.school?.name ?? null,
      dayOfWeek: override.dayOfWeek ?? existing.dayOfWeek,
      startTimeHHMM: dateToHHMM(override.startTime ?? existing.startTime),
      seasonName: override.seasonName ?? existing.season?.name ?? null,
      startYear: startsOn ? startsOn.getUTCFullYear() : null,
      seriesMinAge:
        override.minAge !== undefined ? override.minAge : existing.minAge,
      seriesMaxAge:
        override.maxAge !== undefined ? override.maxAge : existing.maxAge,
      seriesEligibleSkillLevels:
        override.eligibleSkillLevels ?? existing.eligibleSkillLevels,
      groups: override.groups ?? existing.groups,
    });
  });
}

function dateToHHMM(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// -------- LOCATION ---------------------------------------------------------

const LocationSchema = z
  .object({
    classSeriesId: z.string().uuid(),
    deliveryMode: DeliveryMode,
    venueId: z.string().uuid(),
    schoolId: OptionalUuidSchema,
    pickupAt: OptionalTimeSchema,
  })
  .refine((s) => s.deliveryMode !== "pickup" || s.pickupAt != null, {
    message: "pickupAt is required for pickup classes",
    path: ["pickupAt"],
  })
  .refine((s) => s.deliveryMode !== "pickup" || s.schoolId != null, {
    message: "schoolId is required for pickup classes",
    path: ["schoolId"],
  });

export async function updateLocation(formData: FormData) {
  await requireAdmin();
  const parsed = LocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  const existing = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      programId: true,
      deliveryMode: true,
      classType: true,
      name: true,
      nameOverride: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      startsOn: true,
      endsOn: true,
      excludedDates: true,
      defaultCourtId: true,
      courtBlockStartTime: true,
      courtBlockEndTime: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      venue: { select: { name: true } },
      school: { select: { name: true } },
      season: { select: { name: true } },
      program: { select: { targetAudience: true } },
      groups: {
        where: { archivedAt: null },
        orderBy: { displayOrder: "asc" },
        select: {
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
        },
      },
    },
  });
  const { venueClubId } = await validateLocationInvariants({
    deliveryMode: data.deliveryMode,
    venueId: data.venueId,
    schoolId: data.schoolId,
  });
  const nextDefaultCourtId = await validateDefaultCourtForVenue({
    defaultCourtId: existing.defaultCourtId,
    deliveryMode: data.deliveryMode,
    venueClubId,
  });

  // Recompute the canonical name from the new location triple. The
  // server is the only writer of `name` — see `deriveSeriesName`.
  const [nextVenue, nextSchool] = await Promise.all([
    prisma.venue.findUnique({
      where: { id: data.venueId },
      select: { name: true },
    }),
    data.deliveryMode === "pickup" && data.schoolId
      ? prisma.school.findUnique({
          where: { id: data.schoolId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  // If the delivery mode flips, re-derive programId too: `pickup` must
  // snap to the canonical `kids-group` program; otherwise keep whatever
  // the admin had.
  const programId =
    data.deliveryMode === "pickup" && existing.deliveryMode !== "pickup"
      ? await resolveProgramId({ deliveryMode: "pickup", programId: null })
      : existing.programId;

  // Look up the next program's audience whenever programId changed —
  // it feeds the auto-name (kids vs adults suffix). Otherwise the
  // existing audience already covers it.
  const nextAudience =
    programId !== existing.programId
      ? (
          await prisma.program.findUniqueOrThrow({
            where: { id: programId },
            select: { targetAudience: true },
          })
        ).targetAudience
      : existing.program.targetAudience;

  const renamedName = rederiveSeriesName({
    existing,
    override: {
      deliveryMode: data.deliveryMode,
      venueName: nextVenue?.name ?? null,
      schoolName: nextSchool?.name ?? null,
      audience: nextAudience,
    },
  });

  // Also re-derive classType if the mode category changed. We only
  // flip when there's an obvious canonical mapping — admins can fine-
  // tune via the Naming / Program picker afterwards.
  const classType =
    data.deliveryMode !== existing.deliveryMode
      ? data.deliveryMode === "pickup"
        ? "school_pickup"
        : data.deliveryMode === "onsite"
          ? "school_onsite"
          : "group_lesson"
      : existing.classType;

  const clubId =
    data.deliveryMode === "onsite" ? null : (venueClubId ?? null);

  await prisma.classSeries.update({
    where: { id: data.classSeriesId },
    data: {
      deliveryMode: data.deliveryMode,
      venueId: data.venueId,
      schoolId: data.deliveryMode === "pickup" ? data.schoolId : null,
      clubId,
      pickupAt: data.deliveryMode === "pickup" ? data.pickupAt : null,
      programId,
      classType,
      name: renamedName,
      defaultCourtId: nextDefaultCourtId,
      courtBlockStartTime: nextDefaultCourtId
        ? existing.courtBlockStartTime
        : null,
      courtBlockEndTime: nextDefaultCourtId ? existing.courtBlockEndTime : null,
    },
  });

  if (existing.defaultCourtId && !nextDefaultCourtId) {
    if (!existing.dayOfWeek && existing.classType !== "camp") {
      throw new Error("Class schedule is incomplete: missing weekday");
    }
    const excluded = new Set(existing.excludedDates.map((d) => toDateKey(d)));
    const dates = generateSessionsForSeries(existing.classType, {
      startsOn: existing.startsOn,
      endsOn: existing.endsOn,
      dayOfWeek: (existing.dayOfWeek ?? "mon") as
        | "mon"
        | "tue"
        | "wed"
        | "thu"
        | "fri"
        | "sat"
        | "sun",
      startTime: existing.startTime,
      endTime: existing.endTime,
      excluded,
    }).filter((s) => s.startsAt >= new Date());
    await prisma.$transaction(async (tx) => {
      await tx.classSession.deleteMany({
        where: {
          classSeriesId: data.classSeriesId,
          startsAt: { gte: new Date() },
          status: "scheduled",
        },
      });
      if (dates.length > 0) {
        await tx.classSession.createMany({
          data: dates.map((s) => ({
            classSeriesId: data.classSeriesId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status: "scheduled",
          })),
        });
      }
    });
  }

  revalidateSeries(data.classSeriesId);
}

// -------- SCHEDULE ---------------------------------------------------------

const ScheduleSchema = z
  .object({
    classSeriesId: z.string().uuid(),
    dayOfWeek: DayOfWeek,
    startTime: TimeSchema,
    endTime: TimeSchema,
    startsOn: DateSchema,
    endsOn: DateSchema,
    excludedDates: ExcludedDatesSchema,
    /**
     * Season this class is pinned to. Optional — free-form classes
     * (camps, one-offs) can leave it blank. The schedule editor
     * autofills `startsOn`/`endsOn`/`excludedDates` from the season's
     * own date range so the two stay in sync.
     */
    seasonId: OptionalUuidSchema,
    defaultCourtId: OptionalUuidSchema,
    courtBlockStartTime: OptionalTimeSchema,
    courtBlockEndTime: OptionalTimeSchema,
    acknowledgeCourtConflicts: OptionalBoolSchema,
  })
  .refine((s) => s.endsOn >= s.startsOn, {
    message: "endsOn must be after startsOn",
    path: ["endsOn"],
  })
  .refine(
    (s) => s.excludedDates.every((d) => d >= s.startsOn && d <= s.endsOn),
    {
      message: "Some excluded dates are outside the class date range",
      path: ["excludedDates"],
    },
  )
  .refine(
    (s) =>
      (s.defaultCourtId == null &&
        s.courtBlockStartTime == null &&
        s.courtBlockEndTime == null) ||
      (s.defaultCourtId != null &&
        s.courtBlockStartTime != null &&
        s.courtBlockEndTime != null),
    {
      message:
        "defaultCourtId, courtBlockStartTime and courtBlockEndTime must be set together",
      path: ["defaultCourtId"],
    },
  )
  .refine(
    (s) =>
      s.courtBlockStartTime == null ||
      s.courtBlockEndTime == null ||
      s.courtBlockStartTime < s.courtBlockEndTime,
    {
      message: "courtBlockEndTime must be after courtBlockStartTime",
      path: ["courtBlockEndTime"],
    },
  );

export async function updateSchedule(formData: FormData) {
  await requireAdmin();
  const parsed = ScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  const existing = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      classType: true,
      campOptions: true,
      startsOn: true,
      endsOn: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      excludedDates: true,
      name: true,
      nameOverride: true,
      deliveryMode: true,
      pricePerSession: true,
      defaultCourtId: true,
      courtBlockStartTime: true,
      courtBlockEndTime: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      programId: true,
      seasonId: true,
      venue: { select: { name: true, clubId: true, kind: true } },
      school: { select: { name: true } },
      season: { select: { name: true } },
      program: { select: { targetAudience: true } },
      groups: {
        where: { archivedAt: null },
        orderBy: { displayOrder: "asc" },
        select: {
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
        },
      },
    },
  });
  const venueClubId =
    existing.venue.kind === "club" ? (existing.venue.clubId ?? null) : null;
  const nextDefaultCourtId = await validateDefaultCourtForVenue({
    defaultCourtId: data.defaultCourtId,
    deliveryMode: existing.deliveryMode,
    venueClubId,
  });
  const nextCourtBlockStartTime = nextDefaultCourtId
    ? (data.courtBlockStartTime ?? data.startTime)
    : null;
  const nextCourtBlockEndTime = nextDefaultCourtId
    ? (data.courtBlockEndTime ?? data.endTime)
    : null;

  // Cross-table check: a youth program can't pin to an adult season
  // (and vice versa). Free-form seasons (audience === null) skip this.
  await validateSeasonAudienceMatchesProgram({
    seasonId: data.seasonId,
    programId: existing.programId,
  });

  // Fetch the new season's name only if it actually changed; otherwise
  // reuse the in-memory copy. Used by `rederiveSeriesName` so the
  // canonical name picks up the new season prefix immediately.
  const seasonChanged = (existing.seasonId ?? null) !== (data.seasonId ?? null);
  const nextSeason = seasonChanged
    ? data.seasonId
      ? await prisma.season.findUniqueOrThrow({
          where: { id: data.seasonId },
          select: { name: true },
        })
      : null
    : existing.season;

  const existingExcluded = new Set(
    existing.excludedDates.map((d) => toDateKey(d)),
  );
  const newExcluded = new Set(data.excludedDates.map((d) => toDateKey(d)));
  const excludedChanged =
    existingExcluded.size !== newExcluded.size ||
    [...existingExcluded].some((k) => !newExcluded.has(k));

  const scheduleChanged =
    !sameDate(existing.startsOn, data.startsOn) ||
    !sameDate(existing.endsOn, data.endsOn) ||
    existing.dayOfWeek !== data.dayOfWeek ||
    !sameTime(existing.startTime, data.startTime) ||
    !sameTime(existing.endTime, data.endTime) ||
    (existing.defaultCourtId ?? null) !== (nextDefaultCourtId ?? null) ||
    !sameOptionalTime(existing.courtBlockStartTime, nextCourtBlockStartTime) ||
    !sameOptionalTime(existing.courtBlockEndTime, nextCourtBlockEndTime) ||
    excludedChanged;

  // Recompute the canonical name from the new schedule. The server
  // is the only writer of `name`; see `deriveSeriesName`.
  const renamedName = rederiveSeriesName({
    existing,
    override: {
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      startsOn: data.startsOn,
      seasonName: nextSeason?.name ?? null,
    },
  });
  const shouldScanConflicts =
    nextDefaultCourtId != null &&
    (existing.defaultCourtId ?? null) !== (nextDefaultCourtId ?? null);
  const conflictExcluded = shouldScanConflicts
    ? await scanCourtConflicts({
        defaultCourtId: nextDefaultCourtId,
        dayOfWeek: data.dayOfWeek,
        blockStartTime: nextCourtBlockStartTime,
        blockEndTime: nextCourtBlockEndTime,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        excludedDates: data.excludedDates,
        acknowledge: data.acknowledgeCourtConflicts,
      })
    : new Set<string>();
  const mergedExcluded = new Set(data.excludedDates.map((d) => toDateKey(d)));
  for (const key of conflictExcluded) mergedExcluded.add(key);
  const sessionStartTime = nextDefaultCourtId
    ? (nextCourtBlockStartTime ?? data.startTime)
    : data.startTime;
  const sessionEndTime = nextDefaultCourtId
    ? (nextCourtBlockEndTime ?? data.endTime)
    : data.endTime;

  await prisma.$transaction(async (tx) => {
    await tx.classSeries.update({
      where: { id: data.classSeriesId },
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        defaultCourtId: nextDefaultCourtId,
        courtBlockStartTime: nextCourtBlockStartTime,
        courtBlockEndTime: nextCourtBlockEndTime,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        excludedDates: Array.from(mergedExcluded).map((iso) => {
          const [y, m, d] = iso.split("-").map(Number);
          return new Date(Date.UTC(y, m - 1, d));
        }),
        seasonId: data.seasonId,
        name: renamedName,
      },
    });

    if (scheduleChanged) {
      // Delete future scheduled sessions only; preserve past + any
      // that are already marked completed / cancelled.
      await tx.classSession.deleteMany({
        where: {
          classSeriesId: data.classSeriesId,
          startsAt: { gte: new Date() },
          status: "scheduled",
        },
      });

      const dates = generateSessionsForSeries(existing.classType, {
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        dayOfWeek: data.dayOfWeek,
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        excluded: mergedExcluded,
      }).filter((s) => s.startsAt >= new Date());

      if (dates.length > 0) {
        await tx.classSession.createMany({
          data: dates.map((s) => ({
            classSeriesId: data.classSeriesId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            courtId: nextDefaultCourtId,
            status: "scheduled",
          })),
        });
      }

      // Camps use flat week/drop-in prices — do not rescale catalog
      // pricePerSeries when the session count changes.
      if (
        existing.classType !== "camp" &&
        existing.pricePerSession != null
      ) {
        const liveCount = await tx.classSession.count({
          where: {
            classSeriesId: data.classSeriesId,
            status: { not: "cancelled" },
          },
        });
        const perSession = Number(existing.pricePerSession);
        await tx.classSeries.update({
          where: { id: data.classSeriesId },
          data: {
            pricePerSeries: liveCount > 0 ? perSession * liveCount : null,
          },
        });
      }

      if (existing.classType === "camp" && scheduleChanged) {
        const parsed = parseCampOptions(existing.campOptions);
        if (parsed?.dropInEnabled) {
          const allSessions = await tx.classSession.findMany({
            where: {
              classSeriesId: data.classSeriesId,
              status: { not: "cancelled" },
            },
            select: { startsAt: true },
            orderBy: { startsAt: "asc" },
          });
          const synced = syncCampDropInDates(
            parsed,
            allSessions.map((s) => toDateKey(s.startsAt)),
          );
          await tx.classSeries.update({
            where: { id: data.classSeriesId },
            data: {
              campOptions: synced as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
    }
  });

  revalidateSeries(data.classSeriesId);
}

// -------- COACHES ----------------------------------------------------------

const CoachesSchema = z
  .object({
    classSeriesId: z.string().uuid(),
    /** When provided, supersedes the legacy lead/assistant fields. */
    coachAssignmentsJson: CoachAssignmentsJsonSchema,
    leadCoachPersonId: OptionalUuidSchema,
    assistantCoachPersonIds: UuidCsvSchema,
  })
  .refine(
    (s) =>
      s.coachAssignmentsJson.length > 0 ||
      !s.leadCoachPersonId ||
      !s.assistantCoachPersonIds.includes(s.leadCoachPersonId),
    {
      message: "The lead coach can't also be listed as an assistant",
      path: ["assistantCoachPersonIds"],
    },
  )
  .refine(
    (s) =>
      s.coachAssignmentsJson.length > 0 ||
      new Set(s.assistantCoachPersonIds).size ===
        s.assistantCoachPersonIds.length,
    {
      message: "Duplicate assistant coaches are not allowed",
      path: ["assistantCoachPersonIds"],
    },
  );

export async function updateCoaches(formData: FormData) {
  await requireAdmin();
  const parsed = CoachesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  const assignments = normalizeCoachAssignments({
    coachAssignmentsJson: data.coachAssignmentsJson,
    leadCoachPersonId: data.leadCoachPersonId,
    assistantCoachPersonIds: data.assistantCoachPersonIds,
  });

  await validateAssignmentCoaches(assignments);
  const leadId = leadIdFromAssignments(assignments);
  if (leadId === SYSTEM_NO_COACH_PERSON_ID) {
    await resolveLeadCoachPersonId(null);
  }

  // Snapshot the current series' groups + per-coach scopes so we can
  // preserve scopes whose owning coach survives this edit. Coaches
  // who are removed have their scopes dropped (cascade), which leaves
  // their sub-group coachless — that's the intended "logic failure"
  // surface, and the next save on the Sub-groups card will block.
  const existingCoaches = await prisma.classSeriesCoach.findMany({
    where: {
      classSeriesId: data.classSeriesId,
      role: { in: ["lead", "assistant"] },
    },
    select: {
      coachPersonId: true,
      groupScopes: { select: { groupId: true } },
    },
  });
  const groupsOnSeries = await prisma.classSeriesGroup.findMany({
    where: { classSeriesId: data.classSeriesId, archivedAt: null },
    select: { id: true, name: true },
  });

  const incomingPersonIds = new Set(assignments.map((a) => a.coachPersonId));
  // Map of (groupId → coachPersonId still on the roster). When two
  // historical coaches both scoped the same group (legacy chip
  // multi-select), we keep at most one scope per group so the new
  // "single owning coach" invariant holds.
  const survivingScopes = new Map<string, string>();
  for (const c of existingCoaches) {
    if (!incomingPersonIds.has(c.coachPersonId)) continue;
    for (const s of c.groupScopes) {
      if (!survivingScopes.has(s.groupId)) {
        survivingScopes.set(s.groupId, c.coachPersonId);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    // Fully replace the roster for this series. Per-session sub/coach
    // rows on `class_session_coaches` are untouched — they're managed
    // separately for individual session substitutions. Cascading
    // deletes on `class_series_coaches` automatically clear the
    // matching `class_series_coach_groups` rows for removed coaches.
    await tx.classSeriesCoach.deleteMany({
      where: {
        classSeriesId: data.classSeriesId,
        role: { in: ["lead", "assistant"] },
      },
    });

    if (assignments.length === 0) {
      // No real coach picked — drop in the placeholder lead so
      // downstream queries always find a lead row.
      await tx.classSeriesCoach.create({
        data: {
          classSeriesId: data.classSeriesId,
          coachPersonId: SYSTEM_NO_COACH_PERSON_ID,
          role: "lead",
          participatesInPickup: true,
        },
      });
    } else {
      // Recreate the new roster, then re-pin surviving group scopes
      // to the freshly-created `class_series_coaches.id` row.
      const newCoachIdByPersonId = new Map<string, string>();
      for (const a of assignments) {
        const seriesCoach = await tx.classSeriesCoach.create({
          data: {
            classSeriesId: data.classSeriesId,
            coachPersonId: a.coachPersonId,
            role: a.role,
            participatesInPickup: a.participatesInPickup,
          },
          select: { id: true },
        });
        newCoachIdByPersonId.set(a.coachPersonId, seriesCoach.id);
      }
      const scopesToCreate: Array<{
        classSeriesCoachId: string;
        groupId: string;
      }> = [];
      for (const [groupId, coachPersonId] of survivingScopes) {
        const newId = newCoachIdByPersonId.get(coachPersonId);
        if (!newId) continue;
        scopesToCreate.push({ classSeriesCoachId: newId, groupId });
      }
      if (scopesToCreate.length > 0) {
        await tx.classSeriesCoachGroup.createMany({ data: scopesToCreate });
      }
    }

    // Hard-block: when the series has 2+ sub-groups, every group must
    // end up with at least one owning coach scope. Throwing here
    // rolls the whole roster change back so the admin can't leave
    // a sub-group coachless by swapping its assigned coach out from
    // under it. The next save on the Sub-groups card is where they
    // explicitly reassign.
    if (groupsOnSeries.length >= 2) {
      const covered = new Set(survivingScopes.keys());
      const orphan = groupsOnSeries.find((g) => !covered.has(g.id));
      if (orphan) {
        throw new Error(
          `Sub-group "${orphan.name}" would be left coachless by this change. Open the Sub-groups card first and reassign the coach there before swapping the roster here.`,
        );
      }
    }
  });

  revalidateSeries(data.classSeriesId);
}

// -------- NAMING -----------------------------------------------------------

const NamingSchema = z
  .object({
    classSeriesId: z.string().uuid(),
    programId: OptionalUuidSchema,
    /**
     * When `"true"` the admin ticked "Use custom name" and the
     * accompanying `nameOverride` text should be stored verbatim,
     * disabling auto-derivation. When `"false"` (or omitted) the
     * server clears any existing override and recomputes `name`.
     */
    useOverride: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => v === "true"),
    nameOverride: z
      .string()
      .max(160)
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    eventName: z
      .string()
      .max(160)
      .optional()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
    publicNotes: z
      .string()
      .max(4000)
      .optional()
      .nullable()
      .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  })
  .refine((s) => !s.useOverride || (s.nameOverride && s.nameOverride !== ""), {
    message:
      "Custom name can't be blank — uncheck 'Use custom name' to revert to auto.",
    path: ["nameOverride"],
  });

export async function updateNaming(formData: FormData) {
  await requireAdmin();
  const parsed = NamingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  const existing = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      classType: true,
      deliveryMode: true,
      programId: true,
      seasonId: true,
      name: true,
      nameOverride: true,
      dayOfWeek: true,
      startTime: true,
      startsOn: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      venue: { select: { name: true } },
      school: { select: { name: true } },
      season: { select: { name: true } },
      program: { select: { targetAudience: true } },
      groups: {
        where: { archivedAt: null },
        orderBy: { displayOrder: "asc" },
        select: {
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
        },
      },
    },
  });

  if (existing.classType === "event") {
    if (!data.eventName) {
      throw new Error("Event name is required");
    }
    if (!data.publicNotes) {
      throw new Error("Event description is required");
    }
    await prisma.classSeries.update({
      where: { id: data.classSeriesId },
      data: {
        name: data.eventName,
        nameOverride: data.eventName,
        publicNotes: data.publicNotes,
      },
    });
    revalidateSeries(data.classSeriesId);
    return;
  }

  // For non-pickup classes the admin must keep a program selected.
  // Pickup keeps its canonical kids-group program regardless of the
  // submitted programId.
  let programId = existing.programId;
  if (existing.deliveryMode === "pickup") {
    programId = await resolveProgramId({
      deliveryMode: "pickup",
      programId: null,
    });
  } else {
    if (!data.programId) {
      throw new Error("Program is required for non-pickup classes");
    }
    programId = data.programId;
  }

  // The Schedule card now owns Season, but switching the program on a
  // class that's already pinned to a season must still keep the
  // audience pairing valid (e.g. switching to an adult program while
  // a youth season is still pinned).
  await validateSeasonAudienceMatchesProgram({
    seasonId: existing.seasonId,
    programId,
  });

  // Fetch the new program label only when the program actually
  // changed; otherwise reuse the in-memory copy.
  const nextProgram =
    programId !== existing.programId
      ? await prisma.program.findUniqueOrThrow({
          where: { id: programId },
          select: { targetAudience: true },
        })
      : existing.program;

  // Resolve the manual-override toggle. `useOverride=true` stores the
  // typed text verbatim; `useOverride=false` clears any existing
  // override so the row falls back to the derived name on every save.
  const nextOverride = data.useOverride ? data.nameOverride : null;

  const nextName = rederiveSeriesName({
    existing,
    override: {
      audience: nextProgram.targetAudience,
      nameOverride: nextOverride,
    },
  });

  await prisma.classSeries.update({
    where: { id: data.classSeriesId },
    data: {
      name: nextName,
      nameOverride: nextOverride,
      programId,
    },
  });

  revalidateSeries(data.classSeriesId);
}

// -------- AGE & LEVEL ------------------------------------------------------

const AgeAndLevelSchema = z
  .object({
    classSeriesId: z.string().uuid(),
    minAge: OptionalIntSchema,
    maxAge: OptionalIntSchema,
    eligibleSkillLevels: SkillLevelCsvSchema,
  })
  .refine((s) => s.minAge == null || s.maxAge == null || s.minAge <= s.maxAge, {
    message: "minAge must be ≤ maxAge",
    path: ["minAge"],
  });

export async function updateAgeAndLevel(formData: FormData) {
  await requireAdmin();
  const parsed = AgeAndLevelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  // Pull the rest of the rename context up-front so we can re-derive
  // the series name in the same write — series-level age changes
  // ripple into the auto-name (e.g. "kids age 5-12" suffix).
  const existing = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      name: true,
      nameOverride: true,
      deliveryMode: true,
      dayOfWeek: true,
      startTime: true,
      startsOn: true,
      minAge: true,
      maxAge: true,
      eligibleSkillLevels: true,
      venue: { select: { name: true } },
      school: { select: { name: true } },
      season: { select: { name: true } },
      program: { select: { targetAudience: true } },
      groups: {
        where: { archivedAt: null },
        orderBy: { displayOrder: "asc" },
        select: {
          minAge: true,
          maxAge: true,
          eligibleSkillLevels: true,
        },
      },
    },
  });

  const nextName = rederiveSeriesName({
    existing,
    override: {
      minAge: data.minAge,
      maxAge: data.maxAge,
      // Series-level skill levels feed the adult level suffix and
      // need to be threaded into the rename right away — without
      // this the auto-name would lag a save behind the live edit.
      eligibleSkillLevels: data.eligibleSkillLevels,
    },
  });

  await prisma.classSeries.update({
    where: { id: data.classSeriesId },
    data: {
      minAge: data.minAge,
      maxAge: data.maxAge,
      eligibleSkillLevels: data.eligibleSkillLevels,
      name: nextName,
    },
  });
  revalidateSeries(data.classSeriesId);
}

// -------- SUB-GROUPS -------------------------------------------------------

const GroupsUpdateSchema = z.object({
  classSeriesId: z.string().uuid(),
  groupsJson: GroupsJsonSchema,
});

/**
 * Replace the sub-group set for a series. Editing ground rules:
 *   - Existing groups (with `id` in the payload) keep their identity
 *     and any enrollments/coach scopes pointing at them.
 *   - Brand-new rows (no `id`) are inserted.
 *   - Groups present today but missing from the payload are
 *     archive-deleted ONLY when they have zero non-withdrawn
 *     enrollments — otherwise we throw (the admin must move those
 *     students to another group first).
 *   - The series-level `endTime` is lifted to the latest group end so
 *     the calendar span stays correct.
 */
export async function updateGroups(formData: FormData) {
  await requireAdmin();
  const parsed = GroupsUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;
  const terms = await getTerms();
  if (data.groupsJson.length === 0) {
    throw new Error(
      `A ${terms.class.singular.toLowerCase()} needs at least one ${terms.classGroup.singular.toLowerCase()}.`,
    );
  }

  const existing = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      endTime: true,
      minAge: true,
      maxAge: true,
      // Rename context — we recompute `name` in the same transaction
      // because sub-group age splits feed the auto-name (e.g.
      // "kids age 7-9 & 10-12") and per-group level splits feed the
      // adult variant (e.g. "adults Beginner & Intermediate").
      name: true,
      nameOverride: true,
      eligibleSkillLevels: true,
      deliveryMode: true,
      dayOfWeek: true,
      startTime: true,
      startsOn: true,
      venue: { select: { name: true } },
      school: { select: { name: true } },
      season: { select: { name: true } },
      program: { select: { targetAudience: true } },
      groups: {
        select: { id: true, _count: { select: { enrollments: true } } },
      },
      coaches: {
        where: { role: { in: ["lead", "assistant"] } },
        select: { id: true, coachPersonId: true },
      },
    },
  });

  const seriesEndHHMM = data.groupsJson.reduce(
    (acc, g) => maxHHMM(acc, g.endTime),
    toUTCHHMM(existing.endTime),
  );

  const validation = validateGroupsAgainstSeries({
    groups: data.groupsJson,
    seriesEndTime: seriesEndHHMM,
    seriesMinAge: existing.minAge,
    seriesMaxAge: existing.maxAge,
  });
  if (validation) throw new Error(validation);

  // Cross-check sub-group coach picks against the current roster.
  // The placeholder NO-COACH-YET row never appears in the dropdown
  // (the page filters it out before passing coachOptions), so we
  // restrict the eligible set to real lead/assistant coaches.
  const realRosterPersonIds = new Set(
    existing.coaches
      .filter((c) => c.coachPersonId !== SYSTEM_NO_COACH_PERSON_ID)
      .map((c) => c.coachPersonId),
  );
  const coachValidation = validateGroupCoaches({
    groups: data.groupsJson,
    rosterCoachPersonIds: realRosterPersonIds,
    coachSingular: terms.coach.singular,
    classSingular: terms.class.singular,
    classGroupSingular: terms.classGroup.singular,
  });
  if (coachValidation) throw new Error(coachValidation);

  const submittedIds = new Set(
    data.groupsJson.map((g) => g.id).filter((id): id is string => Boolean(id)),
  );
  const dropped = existing.groups.filter((g) => !submittedIds.has(g.id));
  for (const d of dropped) {
    if (d._count.enrollments > 0) {
      throw new Error(
        `One of the removed ${terms.classGroup.plural.toLowerCase()} still has ${terms.enrollment.plural.toLowerCase()}. Move the ${terms.student.plural.toLowerCase()} to another ${terms.classGroup.singular.toLowerCase()} first.`,
      );
    }
  }

  // Map coachPersonId → seriesCoach.id so we can wire scopes inside
  // the transaction without an extra round-trip.
  const seriesCoachIdByPersonId = new Map(
    existing.coaches.map((c) => [c.coachPersonId, c.id]),
  );

  await prisma.$transaction(async (tx) => {
    if (dropped.length > 0) {
      await tx.classSeriesGroup.deleteMany({
        where: { id: { in: dropped.map((d) => d.id) } },
      });
    }

    // Upsert every submitted group, capturing the resulting db id so
    // we can re-pin its `class_series_coach_groups` row immediately
    // afterwards. Brand-new rows get inserted; existing ones get
    // updated in place to preserve enrollments.
    const realGroupIdByTempId = new Map<string, string>();
    for (const [idx, g] of data.groupsJson.entries()) {
      if (g.id) {
        await tx.classSeriesGroup.update({
          where: { id: g.id },
          data: {
            name: g.name,
            displayOrder: g.displayOrder ?? idx,
            minAge: g.minAge,
            maxAge: g.maxAge,
            eligibleSkillLevels: g.eligibleSkillLevels,
            endTime: hhmmToTimeDate(g.endTime),
            maxStudents: g.maxStudents,
            minStudents: g.minStudents,
            internalNotes: g.internalNotes,
          },
        });
        realGroupIdByTempId.set(g.tempId, g.id);
      } else {
        const created = await tx.classSeriesGroup.create({
          data: {
            classSeriesId: data.classSeriesId,
            name: g.name,
            displayOrder: g.displayOrder ?? idx,
            minAge: g.minAge,
            maxAge: g.maxAge,
            eligibleSkillLevels: g.eligibleSkillLevels,
            endTime: hhmmToTimeDate(g.endTime),
            maxStudents: g.maxStudents,
            minStudents: g.minStudents,
            internalNotes: g.internalNotes,
          },
          select: { id: true },
        });
        realGroupIdByTempId.set(g.tempId, created.id);
      }
    }

    // Replace the per-group coach scope for each submitted group:
    // wipe whatever was there, then insert the freshly chosen coach
    // (when one was picked). Using a per-group nuke keeps untouched
    // groups outside the loop unaffected, which matters when only
    // one of several sub-groups gets edited.
    for (const g of data.groupsJson) {
      const realId = realGroupIdByTempId.get(g.tempId)!;
      await tx.classSeriesCoachGroup.deleteMany({
        where: { groupId: realId },
      });
      if (g.coachPersonId) {
        const seriesCoachId = seriesCoachIdByPersonId.get(g.coachPersonId);
        if (!seriesCoachId) {
          throw new Error(
            `Sub-group "${g.name}" is assigned to a coach who isn't on this class' roster. Add them in the Coaches card first, or pick a different coach here.`,
          );
        }
        await tx.classSeriesCoachGroup.create({
          data: {
            classSeriesCoachId: seriesCoachId,
            groupId: realId,
          },
        });
      }
    }

    // Recompute the auto-name from the post-write group set so any
    // sub-group split with distinct age bands shows up in the name
    // (e.g. "kids age 7-9 & 10-12"). The submitted `groupsJson` is
    // authoritative — those rows have already been inserted/updated
    // above and the dropped ones are gone.
    const nextGroups = data.groupsJson
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((g) => ({
        minAge: g.minAge ?? null,
        maxAge: g.maxAge ?? null,
        eligibleSkillLevels: g.eligibleSkillLevels ?? [],
      }));
    const { groups: _existingGroups, coaches: _coaches, ...existingScalar } =
      existing;
    void _existingGroups;
    void _coaches;
    const nextName = rederiveSeriesName({
      existing: { ...existingScalar, groups: nextGroups },
    });

    await tx.classSeries.update({
      where: { id: data.classSeriesId },
      data: {
        endTime: hhmmToTimeDate(seriesEndHHMM),
        name: nextName,
      },
    });
  });

  revalidateSeries(data.classSeriesId);
}

// -------- ROSTER LIMITS ----------------------------------------------------

const RosterLimitsSchema = z.object({
  classSeriesId: z.string().uuid(),
  maxStudents: z.coerce.number().int().min(1).max(200),
  minStudents: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(200)])
    .transform((v) => (v === "" ? null : v)),
  internalNotes: z
    .string()
    .max(4000)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  whatsappUrl: WhatsappUrlSchema,
  coverImageUrl: CoverImageUrlSchema,
});

export async function updateRosterLimits(formData: FormData) {
  await requireAdmin();
  const parsed = RosterLimitsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  // Don't let the admin set a max below the current active enrollment
  // count — that's almost certainly a mistake and silently breaks the
  // capacity invariant surfaced elsewhere.
  const activeCount = await prisma.enrollment.count({
    where: { classSeriesId: data.classSeriesId, status: "active" },
  });
  if (data.maxStudents < activeCount) {
    throw new Error(
      `Can't set max below current active enrollment (${activeCount}).`,
    );
  }

  await prisma.classSeries.update({
    where: { id: data.classSeriesId },
    data: {
      maxStudents: data.maxStudents,
      minStudents: data.minStudents,
      internalNotes: data.internalNotes,
      whatsappUrl: data.whatsappUrl,
      coverImageUrl: data.coverImageUrl,
    },
  });

  revalidateSeries(data.classSeriesId);
}

// -------- PRICING ----------------------------------------------------------

const PricingSchema = z.object({
  classSeriesId: z.string().uuid(),
  pricePerSessionEur: OptionalEurSchema,
  pricingTiersJson: PricingTiersJsonSchema,
  campOptionsJson: CampOptionsJsonSchema,
});

/**
 * Set or clear the catalog price for a class series. Admin types
 * EUR per session; we mirror that to `pricePerSession` and pre-
 * multiply into `pricePerSeries` (= perSession × non-cancelled
 * session count) so the portal pricing engine — which consumes
 * `pricePerSeries` only — stays in lockstep without needing any
 * read-time derivation.
 *
 * Blank input clears both columns and flips the series back into
 * "Contact the office for pricing" mode (no checkout fired). Series
 * with zero non-cancelled sessions can still hold `pricePerSession`
 * but `pricePerSeries` stays null until the schedule is regenerated.
 */
export async function updatePricing(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = PricingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const data = parsed.data;

  const before = await prisma.classSeries.findUniqueOrThrow({
    where: { id: data.classSeriesId },
    select: {
      classType: true,
      pricePerSession: true,
      pricePerSeries: true,
      campOptions: true,
    },
  });

  // Count current non-cancelled sessions so we can pre-multiply
  // pricePerSeries. Cancelled sessions don't count — they don't
  // generate billable lessons.
  const sessionCount = await prisma.classSession.count({
    where: {
      classSeriesId: data.classSeriesId,
      status: { not: "cancelled" },
    },
  });

  let pricePerSession: number | null;
  let pricePerSeries: number | null;
  let pricingTiers: PricingTier[] | null = null;
  let campOptions: CampOptionsConfig | null = null;

  if (before.classType === "event") {
    if (data.pricingTiersJson.length === 0) {
      throw new Error("At least one price is required");
    }
    const tiers = data.pricingTiersJson;
    pricingTiers = tiers;
    const primary = tiers.find((t) => !t.forMembers) ?? tiers[0] ?? null;
    pricePerSeries = primary?.amountEur ?? null;
    pricePerSession =
      pricePerSeries != null && sessionCount > 0
        ? Math.round((pricePerSeries / sessionCount) * 100) / 100
        : pricePerSeries;
  } else if (before.classType === "camp") {
    if (!data.campOptionsJson) {
      throw new Error("Camp options are required");
    }
    campOptions = data.campOptionsJson;
    if (campOptions) {
      const sessionRows = await prisma.classSession.findMany({
        where: {
          classSeriesId: data.classSeriesId,
          status: { not: "cancelled" },
        },
        select: { startsAt: true },
        orderBy: { startsAt: "asc" },
      });
      campOptions = syncCampDropInDates(
        campOptions,
        sessionRows.map((s) => toDateKey(s.startsAt)),
      );
    }
    pricePerSeries = resolveCampCheckoutPrice({
      campOptions,
      selection: campOptions?.options[0]
        ? { optionId: campOptions.options[0].id }
        : null,
      hasActiveMembership: false,
    });
    pricePerSession =
      pricePerSeries != null && sessionCount > 0
        ? Math.round((pricePerSeries / sessionCount) * 100) / 100
        : pricePerSeries;
  } else {
    pricePerSession = data.pricePerSessionEur;
    pricePerSeries =
      pricePerSession != null && sessionCount > 0
        ? pricePerSession * sessionCount
        : null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.classSeries.update({
      where: { id: data.classSeriesId },
      data: {
        pricePerSession,
        pricePerSeries,
        ...(before.classType === "event"
          ? {
              pricingTiers:
                pricingTiers != null && pricingTiers.length > 0
                  ? (pricingTiers as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            }
          : {}),
        ...(before.classType === "camp"
          ? {
              campOptions:
                campOptions != null
                  ? (campOptions as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            }
          : {}),
      },
    });
    await recordAudit({
      tx,
      tableName: "class_series",
      rowId: data.classSeriesId,
      action: "update",
      changedByPersonId: admin.id,
      before: {
        pricePerSession: before.pricePerSession,
        pricePerSeries: before.pricePerSeries,
      },
      after: {
        pricePerSession,
        pricePerSeries,
        sessionCount,
      },
      changeSource: "admin_console",
    });
  });

  revalidateSeries(data.classSeriesId);
}

// ---------------------------------------------------------------------------
// Session-level + enrollment actions (unchanged)
// ---------------------------------------------------------------------------

const CancelSessionSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

export async function cancelSession(formData: FormData) {
  const { person } = await requireAdmin();
  const parsed = CancelSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input");
  }
  const before = await prisma.classSession.findUniqueOrThrow({
    where: { id: parsed.data.sessionId },
    select: {
      id: true,
      classSeriesId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      cancellationReason: true,
    },
  });
  const now = new Date();
  const s = await prisma.$transaction(async (tx) => {
    const updated = await tx.classSession.update({
      where: { id: parsed.data.sessionId },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancelledByPersonId: person.id,
        cancellationReason: parsed.data.reason,
      },
      select: { classSeriesId: true },
    });
    await recordAudit({
      tx,
      tableName: "class_sessions",
      rowId: parsed.data.sessionId,
      action: "update",
      changedByPersonId: person.id,
      before,
      after: {
        status: "cancelled",
        cancelledAt: now.toISOString(),
        cancelledByPersonId: person.id,
        cancellationReason: parsed.data.reason ?? null,
      },
      changeSource: "admin_console",
    });
    return updated;
  });
  revalidatePath(`/admin/classes/${s.classSeriesId}`);
  revalidatePath(`/admin/events/${s.classSeriesId}`);
}

const EnrollmentSchema = z.object({
  classSeriesId: z.string().uuid(),
  studentPersonId: z.string().uuid(),
  /** Required when the series has more than one sub-group. */
  groupId: OptionalUuidSchema,
});

export async function addEnrollment(formData: FormData) {
  const { person } = await requireAdmin();
  const parsed = EnrollmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input");
  }
  const { classSeriesId, studentPersonId } = parsed.data;
  let { groupId } = parsed.data;

  // Verify the person has a student row.
  const student = await prisma.student.findUnique({
    where: { personId: studentPersonId },
    select: { personId: true },
  });
  if (!student) {
    throw new Error(
      "That person isn't set up as a student yet. Create a Student row first.",
    );
  }

  // Validate / pick the group. With exactly one group the admin form
  // can omit it and we resolve it server-side. With more than one,
  // the admin must pick — otherwise the parents and the office can't
  // tell the bands apart.
  const groups = await prisma.classSeriesGroup.findMany({
    where: { classSeriesId, archivedAt: null },
    select: { id: true },
  });
  if (groups.length === 0) {
    throw new Error("This series has no sub-group on disk — fix the series first.");
  }
  if (groups.length === 1 && !groupId) {
    groupId = groups[0].id;
  }
  if (!groupId) {
    throw new Error("Pick a sub-group for this enrollment.");
  }
  if (!groups.find((g) => g.id === groupId)) {
    throw new Error("Selected sub-group does not belong to this class series.");
  }

  await prisma.enrollment.upsert({
    where: {
      classSeriesId_studentPersonId: {
        classSeriesId,
        studentPersonId,
      },
    },
    create: {
      classSeriesId,
      studentPersonId,
      groupId,
      enrolledByPersonId: person.id,
      status: "active",
    },
    update: { status: "active", groupId },
  });

  revalidatePath(`/admin/classes/${classSeriesId}`);
  revalidatePath(`/admin/events/${classSeriesId}`);
  revalidatePath("/portal/book");
}

const ActivateEnrollmentSchema = z.object({
  enrollmentId: z.string().uuid(),
});

export async function activateEnrollment(formData: FormData) {
  await requireAdmin();
  const parsed = ActivateEnrollmentSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  const enrollment = await prisma.enrollment.update({
    where: { id: parsed.data.enrollmentId },
    data: { status: "active" },
    select: { classSeriesId: true },
  });
  revalidatePath(`/admin/classes/${enrollment.classSeriesId}`);
  revalidatePath(`/admin/events/${enrollment.classSeriesId}`);
  revalidatePath("/portal/book");
}

const ResolveReviewSchema = z.object({
  enrollmentId: z.string().uuid(),
});

/**
 * Heather feedback v1: clear the `requiresReview` flag once the office
 * has spoken to the family about an age-band exception. Audited so we
 * can see who signed off (the office runs a "needs review" filter once
 * a week and this is the only way out).
 */
export async function resolveEnrollmentReview(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = ResolveReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid input");
  }
  const before = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: {
      id: true,
      classSeriesId: true,
      requiresReview: true,
      reviewReason: true,
    },
  });
  if (!before) throw new Error("Enrollment not found.");
  if (!before.requiresReview) {
    return; // already resolved — no-op
  }
  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: before.id },
      data: { requiresReview: false, reviewReason: null },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: before.id,
      action: "update",
      changedByPersonId: admin.id,
      before: { requiresReview: true, reviewReason: before.reviewReason },
      after: { requiresReview: false, reviewReason: null },
      changeSource: "admin_console",
    });
  });
  revalidatePath(`/admin/classes/${before.classSeriesId}`);
  revalidatePath(`/admin/events/${before.classSeriesId}`);
  revalidatePath("/admin");
}

const RemoveEnrollmentSchema = z.object({
  enrollmentId: z.string().uuid(),
});

export async function removeEnrollment(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = RemoveEnrollmentSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    throw new Error("Invalid input");
  }

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: {
      id: true,
      status: true,
      classSeriesId: true,
      studentPersonId: true,
      pricePaid: true,
      student: {
        select: {
          person: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      classSeries: {
        select: {
          id: true,
          name: true,
          sessions: {
            select: { startsAt: true },
            orderBy: { startsAt: "asc" },
            take: 1,
          },
          coaches: { select: { coachPersonId: true } },
        },
      },
    },
  });
  if (!enrollment) throw new Error("Enrollment not found");

  if (enrollment.status === "withdrawn" || enrollment.status === "completed") {
    revalidatePath(`/admin/classes/${enrollment.classSeriesId}`);
    revalidatePath(`/admin/events/${enrollment.classSeriesId}`);
    return;
  }

  const now = new Date();
  const firstSessionStart = enrollment.classSeries.sessions[0]?.startsAt ?? null;
  const paid =
    enrollment.pricePaid != null && Number(enrollment.pricePaid) > 0;
  const flagForRefund =
    paid &&
    firstSessionStart != null &&
    firstSessionStart > now &&
    enrollment.status !== "waitlist";

  // Pick the next waitlister inside the same transaction with
  // `FOR UPDATE SKIP LOCKED` so two parallel withdraw flows on the
  // same series never grab the same head — the second txn will skip
  // the locked row and either promote the next one or find nothing.
  const promotion = await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "withdrawn",
        withdrawnOn: now,
        withdrawalReason: "Removed by office",
        refundRequestedAt: flagForRefund ? now : null,
        refundRequestedReason: flagForRefund
          ? "Office removed enrollment before series started while paid."
          : null,
      },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: enrollment.id,
      action: "update",
      changedByPersonId: admin.id,
      before: enrollment,
      after: {
        status: "withdrawn",
        withdrawnOn: now.toISOString(),
        refundRequestedAt: flagForRefund ? now.toISOString() : null,
      },
      changeSource: "admin_console",
    });

    const heads = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM enrollments
      WHERE class_series_id = ${enrollment.classSeriesId}::uuid
        AND status = 'waitlist'
      ORDER BY enrolled_on ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const head = heads[0];
    if (!head) return { promotedId: null as string | null };

    await tx.enrollment.update({
      where: { id: head.id },
      data: { status: "pending_payment" },
    });
    await recordAudit({
      tx,
      tableName: "enrollments",
      rowId: head.id,
      action: "update",
      changedByPersonId: admin.id,
      before: { status: "waitlist" },
      after: { status: "pending_payment", reason: "promoted_from_waitlist" },
      changeSource: "admin_console",
    });
    return { promotedId: head.id };
  });


  // Re-fetch the promoted target outside the txn for the notify() call
  // (notifications + email are non-idempotent and don't belong inside).
  const promotedTarget = promotion.promotedId
    ? await prisma.enrollment.findUnique({
        where: { id: promotion.promotedId },
        select: {
          id: true,
          student: {
            select: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  emails: {
                    where: { isPrimary: true, archivedAt: null },
                    select: { address: true, isPrimary: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      })
    : null;

  // Notify the student/family that the office removed their seat.
  const studentName = `${enrollment.student.person.firstName} ${enrollment.student.person.lastName}`.trim();
  const seriesName = enrollment.classSeries.name;

  const studentEmails = await prisma.emailAddress.findMany({
    where: {
      personId: enrollment.studentPersonId,
      isPrimary: true,
      archivedAt: null,
    },
    select: { address: true },
    take: 1,
  });
  await notify({
    recipientPersonId: enrollment.studentPersonId,
    recipientEmail: studentEmails[0]?.address ?? null,
    channels: studentEmails[0] ? ["in_app", "email"] : ["in_app"],
    templateKey: "enrollment.removed.byOffice",
    subject: `Your spot in ${seriesName} was removed`,
    body: `The office removed ${studentName} from ${seriesName}. Reach out if this was unexpected.`,
    relatedTable: "enrollments",
    relatedRowId: enrollment.id,
  });

  // Coaches.
  const coachIds = enrollment.classSeries.coaches.map((c) => c.coachPersonId);
  if (coachIds.length > 0) {
    const coaches = await prisma.person.findMany({
      where: { id: { in: coachIds } },
      select: {
        id: true,
        emails: {
          where: { isPrimary: true, archivedAt: null },
          select: { address: true },
          take: 1,
        },
      },
    });
    await Promise.all(
      coaches.map((c) =>
        notify({
          recipientPersonId: c.id,
          recipientEmail: c.emails[0]?.address ?? null,
          channels: c.emails[0] ? ["in_app", "email"] : ["in_app"],
          templateKey: "enrollment.removed.coach",
          subject: `${studentName} was removed from ${seriesName}`,
          body: `The office removed ${studentName} from your class ${seriesName}.`,
          relatedTable: "enrollments",
          relatedRowId: enrollment.id,
        }),
      ),
    );
  }

  if (promotedTarget) {
    const promotedEmail = promotedTarget.student.person.emails[0]?.address ?? null;
    await notify({
      recipientPersonId: promotedTarget.student.person.id,
      recipientEmail: promotedEmail,
      channels: promotedEmail ? ["in_app", "email"] : ["in_app"],
      templateKey: "enrollment.waitlist.promoted",
      subject: `You're off the waitlist for ${seriesName}`,
      body: `Good news — a spot opened up in ${seriesName}. Head to the portal to confirm and pay.`,
      relatedTable: "enrollments",
      relatedRowId: promotedTarget.id,
    });
  }

  revalidatePath(`/admin/classes/${enrollment.classSeriesId}`);
  revalidatePath(`/admin/events/${enrollment.classSeriesId}`);
  revalidatePath("/portal/book");
  revalidatePath("/admin/inbox");
  if (flagForRefund) revalidatePath("/admin/payments");
  revalidatePath("/portal/classes");
  revalidatePath("/portal/inbox");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sameDate(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

function sameTime(a: Date, b: Date): boolean {
  return a.getUTCHours() === b.getUTCHours() && a.getUTCMinutes() === b.getUTCMinutes();
}

function sameOptionalTime(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return sameTime(a, b);
}

// ---------------------------------------------------------------------------
// Publish / Unpublish
// ---------------------------------------------------------------------------

const PublishSchema = z.object({
  classSeriesId: z.string().uuid(),
});

/**
 * Flip a class series from `draft` → `published` so it appears in the
 * member catalog. Stamps `publishedAt` the first time around. Idempotent
 * — calling it on an already-published series is a no-op.
 *
 * Without this action there's no way for an admin to take a freshly
 * authored class out of "admin-only" status; that's the missing piece
 * between the editor and the parent portal.
 */
export async function publishSeries(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = PublishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const { classSeriesId } = parsed.data;

  const current = await prisma.classSeries.findUnique({
    where: { id: classSeriesId },
    select: { status: true, publishedAt: true },
  });
  if (!current) throw new Error("Class series not found.");
  if (current.status === "published") {
    revalidatePath(`/admin/classes/${classSeriesId}`);
    revalidatePath(`/admin/events/${classSeriesId}`);
    revalidatePath("/admin/classes");
    revalidatePath("/portal/programs");
    revalidatePath("/portal/book");
    return;
  }

  const now = new Date();
  const newPublishedAt = current.publishedAt ?? now;
  await prisma.$transaction(async (tx) => {
    await tx.classSeries.update({
      where: { id: classSeriesId },
      data: {
        status: "published",
        publishedAt: newPublishedAt,
      },
    });
    await recordAudit({
      tx,
      tableName: "class_series",
      rowId: classSeriesId,
      action: "update",
      changedByPersonId: admin.id,
      before: { status: current.status, publishedAt: current.publishedAt },
      after: {
        status: "published",
        publishedAt: newPublishedAt.toISOString(),
      },
      changeSource: "admin_console",
    });
  });

  revalidatePath(`/admin/classes/${classSeriesId}`);
  revalidatePath(`/admin/events/${classSeriesId}`);
  revalidatePath("/admin/classes");
  revalidatePath("/portal/programs");
  revalidatePath("/portal");
  revalidatePath("/portal/book");
}

/**
 * Pull a class series back to `draft`, e.g. when the admin needs to
 * fix something before parents see it. Doesn't clear `publishedAt` —
 * we keep the audit trail of "first published on …".
 *
 * Refuses when the series already has live enrollments — those
 * parents are expecting to be in the class. Force-unpublish them via
 * status: "cancelled" later if needed.
 */
export async function unpublishSeries(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = PublishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const { classSeriesId } = parsed.data;

  const liveCount = await prisma.enrollment.count({
    where: {
      classSeriesId,
      status: { in: ["active", "pending_payment", "waitlist"] },
    },
  });
  if (liveCount > 0) {
    throw new Error(
      `Cannot unpublish — ${liveCount} live enrollment${liveCount === 1 ? "" : "s"}. Withdraw them first or cancel the series.`,
    );
  }

  const before = await prisma.classSeries.findUniqueOrThrow({
    where: { id: classSeriesId },
    select: { status: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.classSeries.update({
      where: { id: classSeriesId },
      data: { status: "draft" },
    });
    await recordAudit({
      tx,
      tableName: "class_series",
      rowId: classSeriesId,
      action: "update",
      changedByPersonId: admin.id,
      before,
      after: { status: "draft" },
      changeSource: "admin_console",
    });
  });

  revalidatePath(`/admin/classes/${classSeriesId}`);
  revalidatePath(`/admin/events/${classSeriesId}`);
  revalidatePath("/admin/classes");
  revalidatePath("/portal/programs");
  revalidatePath("/portal");
  revalidatePath("/portal/book");
}

// ---------------------------------------------------------------------------
// Duplicate an existing class series (Heather's "give me a copy" workflow)
// ---------------------------------------------------------------------------

const DuplicateSchema = z.object({
  classSeriesId: z.string().uuid(),
});

/**
 * Clone a class series so the admin can spin up next term's edition
 * without re-typing the schedule, groups, coaches and pricing.
 *
 * The copy lands as a `draft` (never auto-published) with the same
 * dates and structure as the source. Sessions are regenerated from the
 * copied schedule, coach scopes and
 * sub-groups are mirrored, and enrollments are intentionally left
 * behind — duplicating a series is about reusing the *shape*, not the
 * roster.
 *
 * Redirects to the new series so the admin can immediately tweak dates
 * before publishing.
 */
export async function duplicateClassSeries(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = DuplicateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const { classSeriesId } = parsed.data;

  const source = await prisma.classSeries.findUnique({
    where: { id: classSeriesId },
    include: {
      groups: { orderBy: { displayOrder: "asc" } },
      coaches: {
        include: {
          groupScopes: { select: { groupId: true } },
        },
      },
    },
  });
  if (!source) throw new Error("Class series not found.");

  const excluded = new Set(
    source.excludedDates.map((d) => toDateKey(new Date(d))),
  );
  const sessions = generateSessionsForSeries(source.classType, {
    startsOn: source.startsOn,
    endsOn: source.endsOn,
    dayOfWeek: source.dayOfWeek as
      | "mon"
      | "tue"
      | "wed"
      | "thu"
      | "fri"
      | "sat"
      | "sun",
    startTime: source.startTime,
    endTime: source.endTime,
    excluded,
  });

  // Re-derive the clone's name from the source's parameters so it
  // always matches the canonical shape — same code path as
  // createClassSeries / updateLocation / updateSchedule. If the
  // source carries a manual override, the clone inherits it
  // verbatim (handled inside resolveSeriesName).
  const newName = await resolveSeriesName({
    programId: source.programId,
    seasonId: source.seasonId,
    deliveryMode: source.deliveryMode,
    venueId: source.venueId,
    schoolId: source.schoolId,
    dayOfWeek: source.dayOfWeek as
      | "mon"
      | "tue"
      | "wed"
      | "thu"
      | "fri"
      | "sat"
      | "sun",
    startTime: source.startTime,
    startsOn: source.startsOn,
    seriesMinAge: source.minAge,
    seriesMaxAge: source.maxAge,
    seriesEligibleSkillLevels: source.eligibleSkillLevels,
    groups: source.groups
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((g) => ({
        minAge: g.minAge,
        maxAge: g.maxAge,
        eligibleSkillLevels: g.eligibleSkillLevels ?? [],
      })),
    nameOverride: source.nameOverride,
  });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.classSeries.create({
      data: {
        program: { connect: { id: source.programId } },
        season: source.seasonId
          ? { connect: { id: source.seasonId } }
          : undefined,
        venue: { connect: { id: source.venueId } },
        school: source.schoolId
          ? { connect: { id: source.schoolId } }
          : undefined,
        club: source.clubId ? { connect: { id: source.clubId } } : undefined,
        name: newName,
        nameOverride: source.nameOverride,
        classType: source.classType,
        deliveryMode: source.deliveryMode,
        dayOfWeek: source.dayOfWeek,
        startTime: source.startTime,
        endTime: source.endTime,
        pickupAt: source.pickupAt,
        startsOn: source.startsOn,
        endsOn: source.endsOn,
        excludedDates: source.excludedDates,
        minAge: source.minAge,
        maxAge: source.maxAge,
        eligibleSkillLevels: source.eligibleSkillLevels,
        maxStudents: source.maxStudents,
        minStudents: source.minStudents,
        publicNotes: source.publicNotes,
        internalNotes: source.internalNotes,
        whatsappUrl: source.whatsappUrl,
        pricePerSession: source.pricePerSession,
        pricePerSeries: source.pricePerSeries,
        status: "draft",
        publishedAt: null,
        sessions: {
          create: sessions.map((s) => ({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            status: "scheduled",
          })),
        },
      },
    });

    // Mirror groups; remember source-id → new-id so we can rewire
    // per-group coach scopes against the new rows.
    const groupIdMap = new Map<string, string>();
    for (const [idx, g] of source.groups.entries()) {
      const dup = await tx.classSeriesGroup.create({
        data: {
          classSeriesId: row.id,
          name: g.name,
          displayOrder: g.displayOrder ?? idx,
          minAge: g.minAge,
          maxAge: g.maxAge,
          eligibleSkillLevels: g.eligibleSkillLevels,
          endTime: g.endTime,
          maxStudents: g.maxStudents,
          minStudents: g.minStudents,
          internalNotes: g.internalNotes,
        },
        select: { id: true },
      });
      groupIdMap.set(g.id, dup.id);
    }

    // Mirror coach assignments + their per-sub-group scopes. The
    // NO COACH YET placeholder rides along on its own and gets cloned
    // verbatim so unassigned series stay unassigned in the copy.
    for (const c of source.coaches) {
      const newCoach = await tx.classSeriesCoach.create({
        data: {
          classSeriesId: row.id,
          coachPersonId: c.coachPersonId,
          role: c.role,
          participatesInPickup: c.participatesInPickup,
        },
        select: { id: true },
      });
      const scopes = c.groupScopes
        .map((s) => groupIdMap.get(s.groupId))
        .filter((id): id is string => Boolean(id))
        .map((groupId) => ({
          classSeriesCoachId: newCoach.id,
          groupId,
        }));
      if (scopes.length > 0) {
        await tx.classSeriesCoachGroup.createMany({ data: scopes });
      }
    }

    await recordAudit({
      tx,
      tableName: "class_series",
      rowId: row.id,
      action: "insert",
      changedByPersonId: admin.id,
      after: {
        name: row.name,
        clonedFromClassSeriesId: source.id,
        clonedFromName: source.name,
        sessionsCreated: sessions.length,
        groupsCreated: source.groups.length,
        coachesCreated: source.coaches.length,
      },
      changeSource: "admin_console",
    });
    return row;
  });

  revalidatePath("/admin/classes");
  redirect(`/admin/classes/${created.id}`);
}

// -------- DELETE -----------------------------------------------------------

const DeleteSchema = z.object({
  classSeriesId: z.string().uuid(),
});

/**
 * Smart delete for a class series.
 *
 * Hard-deletes the row (cascades sessions, groups, coaches and any
 * stub enrollments via Prisma `onDelete: Cascade` in
 * prisma/schema.prisma) only when the series has zero live
 * enrollments, zero in_progress/completed sessions, and no payment
 * lines / credit ledger / transfer rows tied to its enrollments —
 * i.e. fresh drafts and clean test rows that no money has touched.
 * Anything with real activity is soft-archived instead (`archivedAt = now`,
 * `status = "cancelled"`) so historical attendance, payouts and
 * audit trails stay intact while the row disappears from the admin
 * list (see `archivedAt: null` filter in
 * `src/lib/admin/classes-queries.ts`).
 */
export async function deleteClassSeries(formData: FormData) {
  const { person: admin } = await requireAdmin();
  const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }
  const { classSeriesId } = parsed.data;

  const [series, financialFootprint] = await Promise.all([
    prisma.classSeries.findUniqueOrThrow({
      where: { id: classSeriesId },
      select: {
        name: true,
        status: true,
        archivedAt: true,
        _count: {
          select: {
            enrollments: {
              where: {
                status: { in: ["active", "pending_payment", "waitlist"] },
              },
            },
            sessions: {
              where: { status: { in: ["completed", "in_progress"] } },
            },
          },
        },
      },
    }),
    // Withdrawn enrollments still block hard delete: deleting the series
    // cascades to enrollments, but payment_lines.enrollment_id is
    // ON DELETE SET NULL and must keep exactly one target FK.
    Promise.all([
      prisma.paymentLine.count({
        where: { enrollment: { classSeriesId } },
      }),
      prisma.householdCredit.count({
        where: { relatedEnrollment: { classSeriesId } },
      }),
      prisma.classTransferRequest.count({
        where: {
          OR: [
            { fromEnrollment: { classSeriesId } },
            { resultEnrollment: { classSeriesId } },
          ],
        },
      }),
    ]).then(([paymentLines, credits, transfers]) => ({
      paymentLines,
      credits,
      transfers,
    })),
  ]);

  // Already archived — no-op so the kebab menu can be tapped twice
  // without throwing.
  if (series.archivedAt) {
    revalidatePath("/admin/classes");
    return;
  }

  const hasFinancialFootprint =
    financialFootprint.paymentLines > 0 ||
    financialFootprint.credits > 0 ||
    financialFootprint.transfers > 0;

  const canHardDelete =
    series._count.enrollments === 0 &&
    series._count.sessions === 0 &&
    !hasFinancialFootprint;

  if (canHardDelete) {
    await prisma.$transaction(async (tx) => {
      await recordAudit({
        tx,
        tableName: "class_series",
        rowId: classSeriesId,
        action: "delete",
        changedByPersonId: admin.id,
        before: {
          name: series.name,
          status: series.status,
        },
        changeSource: "admin_console",
      });
      await tx.classSeries.delete({ where: { id: classSeriesId } });
    });
  } else {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.classSeries.update({
        where: { id: classSeriesId },
        data: { archivedAt: now, status: "cancelled" },
      });
      await recordAudit({
        tx,
        tableName: "class_series",
        rowId: classSeriesId,
        action: "update",
        changedByPersonId: admin.id,
        before: {
          archivedAt: null,
          status: series.status,
        },
        after: {
          archivedAt: now.toISOString(),
          status: "cancelled",
          liveEnrollments: series._count.enrollments,
          completedOrInProgressSessions: series._count.sessions,
          financialFootprint,
        },
        changeSource: "admin_console",
      });
    });
  }

  revalidatePath("/admin/classes");
}
