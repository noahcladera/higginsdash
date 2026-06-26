import type { StudentAssignmentGap } from "./coach-medals-report";

export type SeriesGapGroup = {
  seriesId: string;
  seriesName: string;
  students: string[];
};

export function groupGapsBySeries(
  gaps: StudentAssignmentGap[],
): SeriesGapGroup[] {
  const bySeries = new Map<string, SeriesGapGroup>();

  for (const gap of gaps) {
    let group = bySeries.get(gap.seriesId);
    if (!group) {
      group = {
        seriesId: gap.seriesId,
        seriesName: gap.seriesName,
        students: [],
      };
      bySeries.set(gap.seriesId, group);
    }
    group.students.push(gap.studentName);
  }

  return [...bySeries.values()].sort((a, b) =>
    a.seriesName.localeCompare(b.seriesName),
  );
}

function formatGapList(groups: SeriesGapGroup[]): string {
  if (groups.length === 0) return "";

  return groups
    .map((group) => {
      const lines = group.students.map((name) => `· ${name}`).join("\n");
      return `${group.seriesName}\n${lines}`;
    })
    .join("\n\n");
}

function formatGapListWhatsApp(groups: SeriesGapGroup[]): string {
  if (groups.length === 0) return "";

  return groups
    .map((group) => {
      const lines = group.students.map((name) => `- ${name}`).join("\n");
      return `${group.seriesName}\n${lines}`;
    })
    .join("\n\n");
}

function seriesLinks(origin: string, groups: SeriesGapGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map(
      (g) =>
        `Open ${g.seriesName}: ${origin}/coach/classes/${g.seriesId}`,
    )
    .join("\n");
}

export function buildMedalReminderInboxBody(input: {
  coachName: string;
  brandName: string;
  origin: string;
  gaps: StudentAssignmentGap[];
}): string {
  const groups = groupGapsBySeries(input.gaps);
  const list = formatGapList(groups);
  const links = seriesLinks(input.origin, groups);

  return (
    `Hi ${input.coachName},\n\n` +
    `${input.brandName} admin reminder — please assign medals for the following students:\n\n` +
    `${list}\n\n` +
    `${links}\n\n` +
    `All your classes: ${input.origin}/coach/classes`
  );
}

export function buildLevelReminderInboxBody(input: {
  coachName: string;
  brandName: string;
  origin: string;
  gaps: StudentAssignmentGap[];
}): string {
  const groups = groupGapsBySeries(input.gaps);
  const list = formatGapList(groups);
  const links = seriesLinks(input.origin, groups);

  return (
    `Hi ${input.coachName},\n\n` +
    `${input.brandName} admin reminder — please assign skill levels for the following students:\n\n` +
    `${list}\n\n` +
    `${links}\n\n` +
    `All your classes: ${input.origin}/coach/classes`
  );
}

export function buildMedalReminderWhatsAppBody(input: {
  coachName: string;
  brandName: string;
  origin: string;
  gaps: StudentAssignmentGap[];
}): string {
  const groups = groupGapsBySeries(input.gaps);
  const list = formatGapListWhatsApp(groups);

  return (
    `Hi ${input.coachName}, ${input.brandName} here.\n\n` +
    `Please assign medals for these students:\n\n` +
    `${list}\n\n` +
    `Your classes: ${input.origin}/coach/classes`
  );
}

export function buildLevelReminderWhatsAppBody(input: {
  coachName: string;
  brandName: string;
  origin: string;
  gaps: StudentAssignmentGap[];
}): string {
  const groups = groupGapsBySeries(input.gaps);
  const list = formatGapListWhatsApp(groups);

  return (
    `Hi ${input.coachName}, ${input.brandName} here.\n\n` +
    `Please assign skill levels for these students:\n\n` +
    `${list}\n\n` +
    `Your classes: ${input.origin}/coach/classes`
  );
}
