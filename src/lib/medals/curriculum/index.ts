export type {
  CeremonyCheckItem,
  CheckpointPart,
  LessonPlanBlock,
  LessonPlanItem,
  LessonPlanWeek,
  LessonTrack,
  LessonTrackId,
  MedalCheckpoint,
  MedalCurriculumLevel,
  QuickStartStep,
  ReferenceVideo,
} from "./types";

export { CHECKPOINT_PART_LABELS } from "./types";

export {
  curriculumLongDescription,
  getAllMedalCurriculum,
  getMedalCurriculum,
  isMedalLevel,
  MEDAL_CURRICULUM,
} from "./checkpoints";

export {
  AGES_4_7_LESSONS,
  getAllLessonTracks,
  getLessonTrack,
  isLessonTrackId,
  LESSON_TRACKS,
  lessonMinutesTotal,
  OLDER_GAMES,
  YOUNGER_GAMES,
} from "./lesson-plans";

export {
  CEREMONY_CHECKLIST,
  FIVE_SKILLS,
  QUICK_START_STEPS,
} from "./quick-start";

export {
  REFERENCE_VIDEOS,
  youtubeEmbedUrl,
  youtubeWatchUrl,
} from "./videos";

export const CURRICULUM_PDFS = {
  yellowOrangeRequirements:
    "/curriculum/medals/medal-requirements-yellow-orange-2.pdf",
  greenSilverRequirements:
    "/curriculum/medals/medal-requirements-green-silver.pdf",
  ages47MedalsCheck:
    "/curriculum/medals/ages-4-7-medals-check.pdf",
  blue2Red2Lessons: "/curriculum/medals/lesson-plans-blue-2-red-2.pdf",
} as const;
