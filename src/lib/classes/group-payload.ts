import { z } from "zod";
import { DEFAULT_TERMS } from "@/lib/tenant/terms";

/**
 * Wire format for the "sub-groups" payload that the class-create form
 * and locked edit page submit. Both the create cascade and the inline
 * group editor share this shape, parsed by the same Zod schema on the
 * server, so admin-side validation lives in exactly one place.
 *
 * Each entry has a stable `tempId` the client uses to refer to the row
 * from elsewhere on the form (notably the per-coach group scope) — for
 * brand-new groups the client picks a synthetic id (e.g. an index or a
 * crypto.randomUUID); for edit flows the client passes the existing
 * group's database id verbatim.
 */
export const SkillLevelEnum = z.enum([
  "red_1",
  "red_2",
  "red_3",
  "orange_1",
  "orange_2",
  "orange_3",
  "green_1",
  "green_2",
  "yellow",
  "adult_beginner_beginner",
  "adult_beginner_intermediate",
  "adult_advanced_beginner",
  "adult_intermediate",
  "adult_advanced",
]);
export type SkillLevelValue = z.infer<typeof SkillLevelEnum>;

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");

/** Per-row group payload, pre-parse. */
export const GroupInputSchema = z.object({
  tempId: z.string().min(1).max(64),
  /** Stable database id when editing; undefined for newly added rows. */
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  displayOrder: z.coerce.number().int().min(0).max(99).default(0),
  endTime: HHMM,
  maxStudents: z.coerce.number().int().min(1).max(200),
  minStudents: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(200)])
    .transform((v) => (v === "" ? null : v))
    .optional()
    .nullable(),
  minAge: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(120)])
    .transform((v) => (v === "" ? null : v))
    .optional()
    .nullable(),
  maxAge: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(120)])
    .transform((v) => (v === "" ? null : v))
    .optional()
    .nullable(),
  eligibleSkillLevels: z.array(SkillLevelEnum).default([]),
  eligibleMedalLevels: z
    .array(
      z.enum([
        "rwb",
        "yellow",
        "purple",
        "blue_1",
        "blue_2",
        "red_1",
        "red_2",
        "orange_1",
        "orange_2",
        "green_1",
        "green_2",
      ]),
    )
    .default([]),
  internalNotes: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  /**
   * Person id of the coach assigned to teach this sub-group. Must be
   * one of the lead/assistant coaches on the same series. Empty string
   * (or omitted) means "no coach yet" — allowed only when the series
   * has a single sub-group, otherwise the action throws.
   */
  coachPersonId: z
    .union([z.literal(""), z.string().uuid()])
    .transform((v) => (v === "" ? null : v))
    .optional()
    .nullable(),
});
export type GroupInput = z.infer<typeof GroupInputSchema>;

export const GroupsJsonSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as GroupInput[];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "groupsJson is not valid JSON",
      });
      return z.NEVER;
    }
    const arr = z.array(GroupInputSchema).safeParse(parsed);
    if (!arr.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: arr.error.issues[0]?.message ?? "Invalid groups payload",
      });
      return z.NEVER;
    }
    return arr.data;
  });

/**
 * Per-coach assignment row. `participatesInPickup` is only consulted
 * when the series is pickup-mode. The "which sub-groups does this
 * coach teach" decision used to live here as `groupTempIds`; it now
 * lives on `GroupInput.coachPersonId` instead, so each sub-group has
 * a single owning coach picked on the Sub-groups card. The legacy
 * `groupTempIds` field is accepted for backwards compatibility on
 * any in-flight payloads but is otherwise ignored by the actions.
 */
export const CoachAssignmentInputSchema = z.object({
  coachPersonId: z.string().uuid(),
  role: z.enum(["lead", "assistant"]),
  participatesInPickup: z.boolean().default(true),
  groupTempIds: z.array(z.string().min(1).max(64)).default([]),
});
export type CoachAssignmentInput = z.infer<typeof CoachAssignmentInputSchema>;

export const CoachAssignmentsJsonSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return [] as CoachAssignmentInput[];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "coachAssignmentsJson is not valid JSON",
      });
      return z.NEVER;
    }
    const arr = z.array(CoachAssignmentInputSchema).safeParse(parsed);
    if (!arr.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: arr.error.issues[0]?.message ?? "Invalid coach assignments",
      });
      return z.NEVER;
    }
    return arr.data;
  });

/**
 * Cross-validate a parsed groups list against the series-level window:
 *   - at least one group
 *   - every `endTime <= series endTime` (series end is the union footprint)
 *   - per-group age band fits inside the series-level [minAge, maxAge]
 *   - all `tempId`s are unique
 *   - at most one group with the same name (prevents accidental dupes)
 */
export function validateGroupsAgainstSeries(args: {
  groups: GroupInput[];
  seriesEndTime: string; // HH:MM
  seriesMinAge: number | null;
  seriesMaxAge: number | null;
}): string | null {
  const { groups, seriesEndTime, seriesMinAge, seriesMaxAge } = args;
  if (groups.length === 0) return "At least one sub-group is required.";

  const seenTempIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const g of groups) {
    if (seenTempIds.has(g.tempId)) {
      return `Duplicate group identifier "${g.tempId}".`;
    }
    seenTempIds.add(g.tempId);

    const lowered = g.name.trim().toLowerCase();
    if (seenNames.has(lowered)) {
      return `Two sub-groups share the name "${g.name}".`;
    }
    seenNames.add(lowered);

    if (g.endTime > seriesEndTime) {
      return `Sub-group "${g.name}" ends after the series end time.`;
    }
    if (g.minAge != null && g.maxAge != null && g.minAge > g.maxAge) {
      return `Sub-group "${g.name}" has min age above max age.`;
    }
    if (
      seriesMinAge != null &&
      g.minAge != null &&
      g.minAge < seriesMinAge
    ) {
      return `Sub-group "${g.name}" allows ages below the series minimum.`;
    }
    if (
      seriesMaxAge != null &&
      g.maxAge != null &&
      g.maxAge > seriesMaxAge
    ) {
      return `Sub-group "${g.name}" allows ages above the series maximum.`;
    }
  }

  return null;
}

/**
 * Cross-validate coach assignments: no coach appears twice, at most
 * one lead. Lead presence is optional — empty assignments list means
 * "no coach yet" and a synthetic lead is added later by the action.
 *
 * The legacy `groupTempIds` field on each assignment is accepted but
 * intentionally not validated here: per-sub-group coaching now lives
 * on `GroupInput.coachPersonId` (see `validateGroupCoaches` below),
 * which is the single source of truth.
 */
export function validateCoachAssignments(args: {
  assignments: CoachAssignmentInput[];
  /** Singular label for the teaching staff role (defaults to tennis-ish copy). */
  coachSingular?: string;
}): string | null {
  const {
    assignments,
    coachSingular = DEFAULT_TERMS.coach.singular,
  } = args;
  let leadCount = 0;
  const seenCoaches = new Set<string>();
  for (const a of assignments) {
    if (seenCoaches.has(a.coachPersonId)) {
      return `Each ${coachSingular.toLowerCase()} can only appear once on this series.`;
    }
    seenCoaches.add(a.coachPersonId);
    if (a.role === "lead") leadCount += 1;
  }
  if (leadCount > 1) {
    return `At most one lead ${coachSingular.toLowerCase()} per series.`;
  }
  return null;
}

/**
 * Cross-validate per-sub-group coach assignments against the series
 * roster:
 *   - When the series has 2+ sub-groups, every group must have a
 *     `coachPersonId` set. A class with split sub-groups but a
 *     coachless sub-group is a logic error (you intended a split,
 *     but you left somebody without a coach).
 *   - Whatever `coachPersonId` is picked must be one of the
 *     submitted lead/assistant coaches.
 *
 * When the series has a single group, the picker is suppressed in
 * the UI and `coachPersonId` is allowed to be null — the lead coach
 * implicitly covers the whole class.
 */
export function validateGroupCoaches(args: {
  groups: GroupInput[];
  rosterCoachPersonIds: Set<string>;
  coachSingular?: string;
  classSingular?: string;
  classGroupSingular?: string;
}): string | null {
  const {
    groups,
    rosterCoachPersonIds,
    coachSingular = DEFAULT_TERMS.coach.singular,
    classSingular = DEFAULT_TERMS.class.singular,
    classGroupSingular = DEFAULT_TERMS.classGroup.singular,
  } = args;
  if (groups.length < 2) return null;
  for (const g of groups) {
    if (!g.coachPersonId) {
      return `${classGroupSingular} "${g.name}" has no assigned ${coachSingular.toLowerCase()}. Pick one from the roster before saving.`;
    }
    if (!rosterCoachPersonIds.has(g.coachPersonId)) {
      return `${classGroupSingular} "${g.name}" is assigned to a ${coachSingular.toLowerCase()} who isn't on this ${classSingular.toLowerCase()}' roster. Pick a lead or assistant ${coachSingular.toLowerCase()}.`;
    }
  }
  return null;
}
