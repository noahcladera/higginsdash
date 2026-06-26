import type { MedalLevel } from "@prisma/client";

export type LessonTrackId = "ages-4-7" | "ages-7-13" | "blue-2-red-2";

export type CheckpointPart = 1 | 2 | 3 | 4 | 5;

export const CHECKPOINT_PART_LABELS: Record<CheckpointPart, string> = {
  1: "Hand / eye & ups / downs",
  2: "Hit & catch",
  3: "Hit & recover / drop feed",
  4: "Serve / rally",
  5: "Game play",
};

export interface MedalCheckpoint {
  part: CheckpointPart;
  label: string;
  requirement: string;
}

export interface MedalCurriculumLevel {
  medalLevel: MedalLevel;
  title: string;
  shortCode: string;
  typicalAge: string;
  ribbonColors: string;
  checkpoints: MedalCheckpoint[];
  graduateTo: string;
  drills: string[];
  technicalFocus: string[];
  lessonTrackId?: LessonTrackId;
  tournamentNote?: string;
}

export interface LessonPlanItem {
  name: string;
  minutes?: number;
  note?: string;
}

export interface LessonPlanBlock {
  phase: string;
  items: LessonPlanItem[];
}

export interface LessonPlanWeek {
  lessonNumber: number;
  title: string;
  duration: string;
  notes?: string;
  blocks: LessonPlanBlock[];
}

export interface LessonTrack {
  id: LessonTrackId;
  title: string;
  description: string;
  ageRange: string;
  pdfPath?: string;
  imagePaths?: string[];
  serveProgressions?: string[];
  lessons?: LessonPlanWeek[];
}

export interface QuickStartStep {
  step: number;
  title: string;
  body: string;
  href?: string;
}

export interface CeremonyCheckItem {
  id: string;
  label: string;
}

export interface ReferenceVideo {
  id: string;
  title: string;
  youtubeId: string;
  ageRange: string;
}
