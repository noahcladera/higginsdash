"use client";

import type { MedalLevelValue } from "@/lib/medal-levels";
import type { SkillLevelValue } from "@/lib/skill-levels";
import { CoachMedalSelect } from "./coach-medal-select";
import { CoachAdultLevelSelect } from "./coach-adult-level-select";

export function CoachStudentLevelSelect({
  classSeriesId,
  studentPersonId,
  medalEligible,
  medalLevel,
  skillLevel,
}: {
  classSeriesId: string;
  studentPersonId: string;
  medalEligible: boolean;
  medalLevel: MedalLevelValue | null;
  skillLevel: SkillLevelValue | null;
}) {
  if (medalEligible) {
    return (
      <CoachMedalSelect
        classSeriesId={classSeriesId}
        studentPersonId={studentPersonId}
        level={medalLevel}
      />
    );
  }
  return (
    <CoachAdultLevelSelect
      classSeriesId={classSeriesId}
      studentPersonId={studentPersonId}
      level={skillLevel}
    />
  );
}
