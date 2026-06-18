/**
 * Higgins medal ladder for under-18 students (workbook codes).
 * Order matches the Nederlands Medals Sheet dropdown.
 */

import type { MedalLevel } from "@prisma/client";

export type MedalLevelValue = MedalLevel;

export const MEDAL_LEVELS: ReadonlyArray<{
  value: MedalLevelValue;
  label: string;
  shortCode: string;
}> = [
  { value: "rwb", label: "Red White Blue", shortCode: "RWB" },
  { value: "yellow", label: "Yellow", shortCode: "Y" },
  { value: "purple", label: "Purple", shortCode: "P" },
  { value: "blue_1", label: "Blue 1", shortCode: "B1" },
  { value: "blue_2", label: "Blue 2", shortCode: "B2" },
  { value: "red_1", label: "Red 1", shortCode: "R1" },
  { value: "red_2", label: "Red 2", shortCode: "R2" },
  { value: "orange_1", label: "Orange 1", shortCode: "O1" },
  { value: "orange_2", label: "Orange 2", shortCode: "O2" },
  { value: "green_1", label: "Green 1", shortCode: "G1" },
  { value: "green_2", label: "Green 2", shortCode: "G2" },
];

const LABEL_BY_VALUE: Record<MedalLevelValue, string> = Object.fromEntries(
  MEDAL_LEVELS.map((l) => [l.value, l.label]),
) as Record<MedalLevelValue, string>;

const CODE_BY_VALUE: Record<MedalLevelValue, string> = Object.fromEntries(
  MEDAL_LEVELS.map((l) => [l.value, l.shortCode]),
) as Record<MedalLevelValue, string>;

export function formatMedalLevel(level: string | null | undefined): string {
  if (!level) return "Not set";
  return LABEL_BY_VALUE[level as MedalLevelValue] ?? level;
}

export function medalShortCode(level: string | null | undefined): string {
  if (!level) return "—";
  return CODE_BY_VALUE[level as MedalLevelValue] ?? level;
}

export function getNextMedalLevel(
  current: MedalLevelValue | null | undefined,
): MedalLevelValue | null {
  if (!current) return null;
  const idx = MEDAL_LEVELS.findIndex((l) => l.value === current);
  if (idx === -1) return null;
  return MEDAL_LEVELS[idx + 1]?.value ?? null;
}

export function getPreviousMedalLevel(
  current: MedalLevelValue | null | undefined,
): MedalLevelValue | null {
  if (!current) return null;
  const idx = MEDAL_LEVELS.findIndex((l) => l.value === current);
  if (idx <= 0) return null;
  return MEDAL_LEVELS[idx - 1].value;
}

/** Age from date of birth in whole years (UTC). */
export function ageFromDob(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function isMedalEligible(input: {
  dateOfBirth?: Date | null;
  roleInHousehold?: string | null;
}): boolean {
  if (input.roleInHousehold === "child") return true;
  const age = ageFromDob(input.dateOfBirth ?? null);
  if (age != null && age < 18) return true;
  return false;
}

export function isAdultSkillEligible(input: {
  dateOfBirth?: Date | null;
  roleInHousehold?: string | null;
}): boolean {
  if (input.roleInHousehold === "child") return false;
  const age = ageFromDob(input.dateOfBirth ?? null);
  if (age != null && age < 18) return false;
  return true;
}

/** Map legacy Tenniskids skill level strings to medal level where possible. */
export function skillLevelToMedalLevel(
  skill: string | null | undefined,
): MedalLevelValue | null {
  if (!skill) return null;
  const map: Record<string, MedalLevelValue> = {
    red_1: "red_1",
    red_2: "red_2",
    red_3: "red_2",
    orange_1: "orange_1",
    orange_2: "orange_2",
    orange_3: "orange_2",
    green_1: "green_1",
    green_2: "green_2",
    yellow: "yellow",
  };
  return map[skill] ?? null;
}
