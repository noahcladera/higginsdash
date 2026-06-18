import {
  formatMedalLevel,
  getNextMedalLevel,
  isMedalEligible,
  type MedalLevelValue,
} from "@/lib/medal-levels";
import {
  formatSkillLevel,
  getNextSkillLevel,
  type SkillLevelValue,
} from "@/lib/skill-levels";

export { isMedalEligible };

export function formatStudentLevel(input: {
  medalEligible: boolean;
  medalLevel: MedalLevelValue | null;
  skillLevel: SkillLevelValue | null;
}): string {
  if (input.medalEligible) return formatMedalLevel(input.medalLevel);
  return formatSkillLevel(input.skillLevel);
}

export function getNextStudentLevel(input: {
  medalEligible: boolean;
  medalLevel: MedalLevelValue | null;
  skillLevel: SkillLevelValue | null;
}): MedalLevelValue | SkillLevelValue | null {
  if (input.medalEligible) return getNextMedalLevel(input.medalLevel);
  return getNextSkillLevel(input.skillLevel);
}

export function studentMedalEligible(
  person: { dateOfBirth: Date | null },
  roleInHousehold: string | null | undefined,
): boolean {
  return isMedalEligible({
    dateOfBirth: person.dateOfBirth,
    roleInHousehold: roleInHousehold ?? null,
  });
}
