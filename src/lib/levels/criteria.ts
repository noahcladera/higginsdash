/**
 * Per-level rubric: shared queries for `level_criteria` and the
 * student-side `student_level_progress` ticks. Used by:
 *
 *   - `/admin/settings/levels/[skillLevel]`  (admin CRUD)
 *   - `/coach/classes/[seriesId]/students/[personId]`  (coach checklist)
 *   - `/levels/[skillLevel]`  (parent-facing rubric, optionally with ticks
 *     overlaid for the viewer's own kids)
 *   - `/portal/family`  (per-child progress bar)
 *
 * The "current level" of a criterion is the student's `students.skill_level`;
 * once they're promoted past it the row stays as silent history but the
 * UI only counts criteria for the current level. See design/database.md
 * §2.5.3 / §2.5.4.
 */

import { cache } from "react";
import type { SkillLevel } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface CriterionRow {
  id: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface CriterionWithProgress extends CriterionRow {
  /** When this student got the tick — null when still un-ticked. */
  achievedAt: Date | null;
  achievedByPersonId: string | null;
}

/**
 * Live (un-archived) criteria for a single level, in display order.
 */
export const listCriteriaForLevel = cache(_listCriteriaForLevel);
async function _listCriteriaForLevel(
  skillLevel: SkillLevel,
): Promise<CriterionRow[]> {
  const rows = await prisma.levelCriterion.findMany({
    where: { skillLevel, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      description: true,
      sortOrder: true,
    },
  });
  return rows;
}

/**
 * Admin variant: includes archived rows so the settings page can show
 * (and un-archive) them. Sorted live-first then archived-last.
 */
export async function listCriteriaForLevelAdmin(
  skillLevel: SkillLevel,
): Promise<Array<CriterionRow & { archivedAt: Date | null }>> {
  return prisma.levelCriterion.findMany({
    where: { skillLevel },
    orderBy: [
      { archivedAt: "asc" },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      label: true,
      description: true,
      sortOrder: true,
      archivedAt: true,
    },
  });
}

/**
 * For a student, return all live criteria for `skillLevel` paired with
 * the student's current tick state. Pass the student's *current*
 * `skill_level` when you want "what's left to graduate".
 */
export async function getStudentCriteriaWithProgress(
  studentPersonId: string,
  skillLevel: SkillLevel,
): Promise<CriterionWithProgress[]> {
  const [criteria, progress] = await Promise.all([
    listCriteriaForLevel(skillLevel),
    prisma.studentLevelProgress.findMany({
      where: {
        studentId: studentPersonId,
        criterion: { skillLevel },
      },
      select: {
        criterionId: true,
        achievedAt: true,
        achievedByPersonId: true,
      },
    }),
  ]);

  const byCriterion = new Map(progress.map((p) => [p.criterionId, p]));
  return criteria.map((c) => {
    const tick = byCriterion.get(c.id) ?? null;
    return {
      ...c,
      achievedAt: tick?.achievedAt ?? null,
      achievedByPersonId: tick?.achievedByPersonId ?? null,
    };
  });
}

export interface ProgressSummary {
  /** Total live criteria for the level. 0 when the level has no rubric yet. */
  total: number;
  /** Number ticked for this student. */
  achieved: number;
}

/**
 * Cheap per-student summary used by widgets (family page progress bar).
 * Returns `{ total: 0 }` if no rubric is configured for the level — caller
 * should hide the bar in that case.
 */
export async function getStudentProgressSummary(
  studentPersonId: string,
  skillLevel: SkillLevel,
): Promise<ProgressSummary> {
  const [total, achieved] = await Promise.all([
    prisma.levelCriterion.count({
      where: { skillLevel, archivedAt: null },
    }),
    prisma.studentLevelProgress.count({
      where: {
        studentId: studentPersonId,
        criterion: { skillLevel, archivedAt: null },
      },
    }),
  ]);
  return { total, achieved };
}

/**
 * Bulk variant of {@link getStudentProgressSummary}. Returns one entry per
 * `(studentPersonId, skillLevel)` pair the caller asked for; missing
 * pairs are filled with `{ total, achieved: 0 }`.
 */
export async function getStudentProgressSummariesBulk(
  pairs: Array<{ studentPersonId: string; skillLevel: SkillLevel }>,
): Promise<Map<string, ProgressSummary>> {
  // Key by `${studentId}::${level}` so a household with two kids on the
  // same level gets two distinct entries.
  const out = new Map<string, ProgressSummary>();
  if (pairs.length === 0) return out;

  const levels = [...new Set(pairs.map((p) => p.skillLevel))];
  const studentIds = [...new Set(pairs.map((p) => p.studentPersonId))];

  const [criteriaCounts, progress] = await Promise.all([
    prisma.levelCriterion.groupBy({
      by: ["skillLevel"],
      where: { skillLevel: { in: levels }, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.studentLevelProgress.findMany({
      where: {
        studentId: { in: studentIds },
        criterion: { skillLevel: { in: levels }, archivedAt: null },
      },
      select: {
        studentId: true,
        criterion: { select: { skillLevel: true } },
      },
    }),
  ]);

  const totalByLevel = new Map(
    criteriaCounts.map((c) => [c.skillLevel, c._count._all]),
  );

  const achievedKey = (s: string, l: SkillLevel) => `${s}::${l}`;
  const achievedCounts = new Map<string, number>();
  for (const row of progress) {
    const k = achievedKey(row.studentId, row.criterion.skillLevel);
    achievedCounts.set(k, (achievedCounts.get(k) ?? 0) + 1);
  }

  for (const p of pairs) {
    out.set(achievedKey(p.studentPersonId, p.skillLevel), {
      total: totalByLevel.get(p.skillLevel) ?? 0,
      achieved: achievedCounts.get(achievedKey(p.studentPersonId, p.skillLevel)) ?? 0,
    });
  }
  return out;
}
