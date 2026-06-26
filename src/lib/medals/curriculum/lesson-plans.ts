import type { LessonPlanWeek, LessonTrack } from "./types";

const LESSON_1_BLOCKS: LessonPlanWeek["blocks"] = [
  {
    phase: "Warm-up",
    items: [
      { name: "Follow the Leader Freeze!", minutes: 2 },
      { name: "Learn Names & Rules & Talk About Earning Medals", minutes: 5 },
      { name: "Umbrella Fountain", minutes: 2 },
      { name: "Walk the Dog", minutes: 3 },
      { name: "Bounce Ups", minutes: 3 },
      { name: "Downs", minutes: 3 },
    ],
  },
  {
    phase: "Game 1",
    items: [
      { name: "Catch the Mice", minutes: 3 },
      { name: "Sweep the Mice", minutes: 5 },
      { name: "Water Break", minutes: 4 },
    ],
  },
  {
    phase: "Game 2",
    items: [
      { name: "Forehand Line", minutes: 12 },
      { name: "Feed the Monkeys Forehands", minutes: 12 },
    ],
  },
  {
    phase: "Extra",
    items: [{ name: "Train", note: "If you have extra time" }],
  },
];

function lesson1Template(n: number, title: string, notes?: string): LessonPlanWeek {
  return {
    lessonNumber: n,
    title,
    duration: "45–60 min",
    notes,
    blocks: LESSON_1_BLOCKS,
  };
}

export const AGES_4_7_LESSONS: LessonPlanWeek[] = [
  lesson1Template(1, "Lesson 1 — Introduction"),
  {
    lessonNumber: 2,
    title: "Lesson 2 — Review",
    duration: "45–60 min",
    notes:
      "Same as Lesson 1. Review names & rules. Skip Forehand Line — go straight to Feed the Monkeys. You may have time for Train.",
    blocks: LESSON_1_BLOCKS.filter((b) => b.phase !== "Game 2").concat([
      {
        phase: "Game 2",
        items: [{ name: "Feed the Monkeys Forehands", minutes: 15 }],
      },
      { phase: "Extra", items: [{ name: "Train", note: "If time allows" }] },
    ]),
  },
  {
    lessonNumber: 3,
    title: "Lesson 3 — Backhands",
    duration: "45–60 min",
    notes:
      "Same as Lesson 1 but skip Names & Rules. Replace forehands with backhands in Feed the Monkeys.",
    blocks: LESSON_1_BLOCKS,
  },
  {
    lessonNumber: 4,
    title: "Lesson 4 — Adjust to audience",
    duration: "45–60 min",
    notes:
      "Older kids: laps and shuffle instead of Follow the Leader; skip Walk the Dog and Catch & Sweep Mice. Start with Feed the Monkeys and Train.",
    blocks: [
      {
        phase: "Warm-up",
        items: [
          { name: "Laps & shuffle (older kids)", minutes: 5 },
          { name: "Bounce Ups & Downs", minutes: 5 },
        ],
      },
      {
        phase: "Games",
        items: [
          { name: "Feed the Monkeys", minutes: 20 },
          { name: "Train", minutes: 15 },
        ],
      },
    ],
  },
  ...Array.from({ length: 8 }, (_, i) => ({
    lessonNumber: i + 5,
    title: `Lesson ${i + 5}`,
    duration: "45–60 min",
    notes:
      i === 7
        ? "Final week: run medals check in last 15 min. See ceremony checklist."
        : "Keep structure & incorporate backhands. Remind them about earning medals.",
    blocks: [
      {
        phase: "Warm-up",
        items: [
          {
            name: "Bounce Ups & Downs — push for in-a-row counts",
            minutes: 8,
          },
        ],
      },
      {
        phase: "Game 1",
        items: [
          {
            name: "Feed the Monkeys — earn points for balls in; alternate FH/BH",
            minutes: 15,
          },
        ],
      },
      {
        phase: "Game 2",
        items: [
          {
            name:
              i >= 6
                ? "Skyball with Crazy Tennis Rules (play every lesson)"
                : "New game — teach then repeat next week (Skyball for older kids)",
            minutes: 15,
          },
        ],
      },
    ] as LessonPlanWeek["blocks"],
  })),
];

export const YOUNGER_GAMES = [
  "Castle",
  "Animal Tennis",
  "Baby Bird's Nest",
  "Red Light Green Light",
  "Waterfall",
  "Ski Run",
  "Hockey Tennis",
  "Ice Cream Truck",
];

export const OLDER_GAMES = [
  "Skyball with Crazy Tennis Rules",
  "Ice Cream Truck or Master Chef",
  "Race Car Tennis",
];

export const LESSON_TRACKS: LessonTrack[] = [
  {
    id: "ages-4-7",
    title: "Ages 4–7",
    description: "12-week progression with medals reminders built in.",
    ageRange: "4–7",
    pdfPath: "/curriculum/medals/ages-4-7-lesson-plan.pdf",
    lessons: AGES_4_7_LESSONS,
  },
  {
    id: "ages-7-13",
    title: "Ages 7–13",
    description: "Print-and-take-on-court lesson plans for older kids.",
    ageRange: "7–13",
    imagePaths: [
      "/curriculum/medals/lesson-1-2-ages-7-12.jpeg",
      "/curriculum/medals/lesson-3-ages-7-12.jpeg",
      "/curriculum/medals/lesson-4-ages-7-12.jpeg",
    ],
  },
  {
    id: "blue-2-red-2",
    title: "Blue 2 – Red 2",
    description: "Final-week serve progressions and medal requirements.",
    ageRange: "7–12",
    pdfPath: "/curriculum/medals/lesson-plans-blue-2-red-2.pdf",
    serveProgressions: [
      "Five Alive",
      "Tap Hit",
      "Serve progressions for Red 1 and Red 2 medal checkpoints",
      "Updated medal requirements on final week sheet",
    ],
  },
];

const TRACK_BY_ID = new Map(LESSON_TRACKS.map((t) => [t.id, t]));

export function getLessonTrack(id: string): LessonTrack | undefined {
  return TRACK_BY_ID.get(id as LessonTrack["id"]);
}

export function getAllLessonTracks(): LessonTrack[] {
  return LESSON_TRACKS;
}

export function isLessonTrackId(value: string): value is LessonTrack["id"] {
  return TRACK_BY_ID.has(value as LessonTrack["id"]);
}

/** Sum minutes in a lesson where specified. */
export function lessonMinutesTotal(lesson: LessonPlanWeek): number {
  return lesson.blocks.reduce(
    (sum, block) =>
      sum +
      block.items.reduce((s, item) => s + (item.minutes ?? 0), 0),
    0,
  );
}
