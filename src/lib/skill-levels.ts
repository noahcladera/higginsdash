/**
 * UI labels and groupings for the SkillLevel enum (see prisma/schema.prisma).
 * Keep in sync with prisma/schema.prisma#SkillLevel and the
 * SKILL_LEVELS / SkillLevelEnum in src/app/admin/people/actions.ts.
 */

export type SkillLevelValue =
  | "red_1"
  | "red_2"
  | "red_3"
  | "orange_1"
  | "orange_2"
  | "orange_3"
  | "green_1"
  | "green_2"
  | "yellow"
  | "adult_beginner_beginner"
  | "adult_beginner_intermediate"
  | "adult_advanced_beginner"
  | "adult_intermediate"
  | "adult_advanced";

export const KIDS_LEVELS: ReadonlyArray<{
  value: SkillLevelValue;
  label: string;
}> = [
  { value: "red_1", label: "Red 1" },
  { value: "red_2", label: "Red 2" },
  { value: "red_3", label: "Red 3" },
  { value: "orange_1", label: "Orange 1" },
  { value: "orange_2", label: "Orange 2" },
  { value: "orange_3", label: "Orange 3" },
  { value: "green_1", label: "Green 1" },
  { value: "green_2", label: "Green 2" },
  { value: "yellow", label: "Yellow" },
];

export const ADULT_LEVELS: ReadonlyArray<{
  value: SkillLevelValue;
  label: string;
}> = [
  { value: "adult_beginner_beginner", label: "Beginner — Beginner" },
  { value: "adult_beginner_intermediate", label: "Beginner — Intermediate" },
  { value: "adult_advanced_beginner", label: "Beginner — Advanced" },
  { value: "adult_intermediate", label: "Intermediate" },
  { value: "adult_advanced", label: "Advanced" },
];

const LABEL_BY_VALUE: Record<SkillLevelValue, string> = Object.fromEntries(
  [...KIDS_LEVELS, ...ADULT_LEVELS].map((l) => [l.value, l.label]),
) as Record<SkillLevelValue, string>;

export function formatSkillLevel(level: string | null | undefined): string {
  if (!level) return "Not set";
  return LABEL_BY_VALUE[level as SkillLevelValue] ?? level;
}

/**
 * Resolve the "next" level a student would move to when promoted from
 * `current`. Walks the kids ladder for kid levels and the adults
 * ladder for adult levels (no cross-track jumps). Returns `null` when
 * `current` is the top of its ladder or unknown.
 */
export function getNextSkillLevel(
  current: SkillLevelValue | null | undefined,
): SkillLevelValue | null {
  if (!current) return null;
  for (const ladder of [KIDS_LEVELS, ADULT_LEVELS]) {
    const idx = ladder.findIndex((l) => l.value === current);
    if (idx === -1) continue;
    return ladder[idx + 1]?.value ?? null;
  }
  return null;
}

/**
 * Inverse of {@link getNextSkillLevel} — used to record demotions in
 * the season-end review flow.
 */
export function getPreviousSkillLevel(
  current: SkillLevelValue | null | undefined,
): SkillLevelValue | null {
  if (!current) return null;
  for (const ladder of [KIDS_LEVELS, ADULT_LEVELS]) {
    const idx = ladder.findIndex((l) => l.value === current);
    if (idx === -1) continue;
    return idx > 0 ? ladder[idx - 1].value : null;
  }
  return null;
}
